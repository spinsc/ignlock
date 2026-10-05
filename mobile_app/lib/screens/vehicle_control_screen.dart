import 'dart:async';
import 'package:flutter/material.dart';
import '../services/active_vehicle_store.dart';
import '../services/ble_service.dart';
import '../services/driver_session_service.dart';

/// Controle da partida: botão redondo vermelho (partida ligada → toque para
/// DESLIGAR) que vira verde (desligada → toque para LIGAR). O saldo de tempo
/// de uso só desconta com a partida ligada — ver firmware/src/lock_controller.cpp.
class VehicleControlScreen extends StatefulWidget {
  final DriverSession session;
  final ActiveVehicle vehicle;

  const VehicleControlScreen({super.key, required this.session, required this.vehicle});

  @override
  State<VehicleControlScreen> createState() => _VehicleControlScreenState();
}

class _VehicleControlScreenState extends State<VehicleControlScreen> {
  final _ble = BleService();
  StreamSubscription<LockStatusUpdate>? _sub;
  Timer? _timer;

  LockStatusUpdate? _status;
  DateTime _statusAt = DateTime.now();
  bool _busy = false;
  String? _error;
  int _ticks = 0;

  @override
  void initState() {
    super.initState();
    _sub = _ble.statusStream.listen(_apply);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _onTick());
    _refresh();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _sub?.cancel();
    _ble.disconnect();
    _ble.dispose();
    super.dispose();
  }

  void _apply(LockStatusUpdate s) {
    if (!mounted) return;
    setState(() {
      _status = s;
      _statusAt = DateTime.now();
      _error = null;
    });
  }

  Future<void> _ensureConnected() async {
    if (!_ble.isConnected) {
      await _ble.connectByMac(widget.vehicle.bleMac);
    }
  }

  Future<void> _refresh() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _ensureConnected();
      _apply(await _ble.readStatus());
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _onTick() {
    if (!mounted) return;
    _ticks++;
    // Releitura periódica quando conectado (o firmware só notifica em mudança de estado).
    if (_ticks % 30 == 0 && _ble.isConnected && !_busy) {
      _ble.readStatus().then(_apply).catchError((_) {});
    }
    setState(() {}); // atualiza o contador regressivo
  }

  Future<void> _toggle() async {
    final s = _status;
    if (s == null || _busy) return;
    final command = s.status == LockStatus.unlocked ? 'PAUSE' : 'RESUME';
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _ensureConnected();
      await _ble.sendControl(command, widget.session.driverCode);
      await Future.delayed(const Duration(milliseconds: 400));
      final after = await _ble.readStatus();
      _apply(after);
      final expected = command == 'PAUSE' ? LockStatus.paused : LockStatus.unlocked;
      if (after.status != expected && mounted) {
        setState(() => _error = 'O veículo não aceitou o comando. Se o tempo acabou, faça uma nova liberação pela tag NFC.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  int get _remaining {
    final s = _status;
    if (s == null) return 0;
    if (s.status != LockStatus.unlocked) return s.remainingSeconds;
    final elapsed = DateTime.now().difference(_statusAt).inSeconds;
    return (s.remainingSeconds - elapsed).clamp(0, 1 << 30);
  }

  String _fmt(int secs) {
    final h = secs ~/ 3600;
    final m = (secs % 3600) ~/ 60;
    final sec = secs % 60;
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(h)}:${two(m)}:${two(sec)}';
  }

  @override
  Widget build(BuildContext context) {
    final s = _status;
    final on = s?.status == LockStatus.unlocked;
    final paused = s?.status == LockStatus.paused;
    final canToggle = (on || paused) && !_busy;

    final color = on ? Colors.red : (paused ? Colors.green : Colors.grey);
    final label = on ? 'DESLIGAR' : (paused ? 'LIGAR' : '—');
    final caption = s == null
        ? (_busy ? 'Conectando ao veículo…' : 'Sem conexão com o veículo.')
        : on
            ? 'Partida ligada — o tempo está contando.'
            : paused
                ? 'Partida desligada — o tempo está parado.'
                : 'Tempo de uso esgotado. Faça uma nova liberação pela tag NFC.';

    return Scaffold(
      appBar: AppBar(title: Text('Partida — ${widget.vehicle.vehicleId}')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Spacer(),
            GestureDetector(
              onTap: canToggle ? _toggle : null,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                width: 220,
                height: 220,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: color,
                  boxShadow: [BoxShadow(color: color.withOpacity(0.45), blurRadius: 24, spreadRadius: 2)],
                ),
                alignment: Alignment.center,
                child: _busy
                    ? const CircularProgressIndicator(color: Colors.white)
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(on ? Icons.power_settings_new : Icons.play_arrow, size: 64, color: Colors.white),
                          const SizedBox(height: 6),
                          Text(label,
                              style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 28),
            Text('Tempo de uso restante', style: Theme.of(context).textTheme.labelLarge),
            Text(
              s == null ? '--:--:--' : _fmt(_remaining),
              style: Theme.of(context).textTheme.displaySmall?.copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
            ),
            const SizedBox(height: 12),
            Text(caption, textAlign: TextAlign.center),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red)),
            ],
            const Spacer(),
            if (s == null && !_busy)
              OutlinedButton(onPressed: _refresh, child: const Text('Conectar de novo')),
            const SizedBox(height: 8),
            Text(
              'O tempo só desconta com a partida ligada. Fique perto do veículo para ligar/desligar (Bluetooth).',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
