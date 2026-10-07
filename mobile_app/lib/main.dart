import 'dart:async';
import 'package:flutter/material.dart';
import 'package:app_links/app_links.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/supabase_config.dart';
import 'screens/auth_flow_screen.dart';
import 'screens/login_screen.dart';
import 'services/active_vehicle_store.dart';
import 'services/driver_session_service.dart';
import 'services/tenant_context.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: SupabaseConfig.url,
    anonKey: SupabaseConfig.anonKey,
  );
  runApp(const IgnitionLockApp());
}

class IgnitionLockApp extends StatelessWidget {
  const IgnitionLockApp({super.key});

  @override
  Widget build(BuildContext context) {
    // O mesmo APK serve a todas as empresas: a cor da marca vem do servidor.
    return ValueListenableBuilder<Color?>(
      valueListenable: AppTenant.brand,
      builder: (context, brand, _) => MaterialApp(
        title: 'Liberação de Partida',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorSchemeSeed: brand ?? Colors.blue,
          useMaterial3: true,
        ),
        home: const _SessionGate(),
      ),
    );
  }
}

/// Decide entre login e fluxo de liberação conforme a sessão salva.
class _SessionGate extends StatefulWidget {
  const _SessionGate();

  @override
  State<_SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<_SessionGate> {
  final _service = DriverSessionService();
  DriverSession? _session;
  bool _loading = true;

  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    _restore();
    _listenInvites();
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    super.dispose();
  }

  /// Convite por QR/link: ignlock://join?c=<código da empresa>.
  void _listenInvites() {
    void handle(Uri? uri) {
      if (uri == null || uri.scheme != 'ignlock' || uri.host != 'join') return;
      final c = uri.queryParameters['c'];
      if (c != null && c.trim().isNotEmpty) DriverSessionService.pendingInvite.value = c.trim();
    }

    final links = AppLinks();
    links.getInitialLink().then(handle).catchError((_) {});
    _linkSub = links.uriLinkStream.listen(handle, onError: (_) {});
  }

  Future<void> _restore() async {
    var s = await _service.load();
    if (s != null) {
      if (!await _service.stillActive(s)) {
        await _service.logout();
        s = null;
      } else {
        _service.refreshTenantData(s); // parâmetros e parceiros atualizados, sem bloquear
      }
    }
    if (mounted) {
      setState(() {
        _session = s;
        _loading = false;
      });
    }
  }

  Future<void> _logout() async {
    await _service.logout();
    await ActiveVehicleStore().clear(); // o veículo ativo pertence ao motorista que saiu
    if (mounted) setState(() => _session = null);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final s = _session;
    if (s == null) {
      return LoginScreen(service: _service, onLoggedIn: (x) => setState(() => _session = x));
    }
    return AuthFlowScreen(session: s, onLogout: _logout);
  }
}
