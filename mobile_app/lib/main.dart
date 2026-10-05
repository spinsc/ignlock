import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/supabase_config.dart';
import 'screens/auth_flow_screen.dart';
import 'screens/login_screen.dart';
import 'services/driver_session_service.dart';

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
    return MaterialApp(
      title: 'Liberação de Partida',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
      ),
      home: const _SessionGate(),
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

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    var s = await _service.load();
    if (s != null && !await _service.stillActive(s.driverCode)) {
      await _service.logout();
      s = null;
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
