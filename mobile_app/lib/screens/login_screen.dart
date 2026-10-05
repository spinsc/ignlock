import 'package:flutter/material.dart';
import '../services/driver_session_service.dart';

class LoginScreen extends StatefulWidget {
  final DriverSessionService service;
  final void Function(DriverSession) onLoggedIn;

  const LoginScreen({super.key, required this.service, required this.onLoggedIn});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _code = TextEditingController();
  final _pin = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final (result, session) = await widget.service.login(_code.text, _pin.text);
    if (!mounted) return;
    switch (result) {
      case LoginResult.ok:
        widget.onLoggedIn(session!);
        return;
      case LoginResult.invalid:
        _error = 'Matrícula ou PIN incorretos.';
      case LoginResult.locked:
        _error = 'Muitas tentativas. Conta bloqueada por 15 minutos — ou peça um novo PIN ao administrador.';
      case LoginResult.offline:
        _error = 'Sem conexão com o servidor. O primeiro acesso precisa de internet.';
    }
    setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Entrar')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _form,
          child: ListView(
            children: [
              const SizedBox(height: 16),
              const Icon(Icons.lock_outline, size: 72),
              const SizedBox(height: 24),
              TextFormField(
                controller: _code,
                decoration: const InputDecoration(labelText: 'Matrícula / ID do condutor'),
                textInputAction: TextInputAction.next,
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _pin,
                decoration: const InputDecoration(labelText: 'PIN'),
                keyboardType: TextInputType.number,
                obscureText: true,
                onFieldSubmitted: (_) => _submit(),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 16),
              if (_error != null) ...[
                Text(_error!, style: const TextStyle(color: Colors.red)),
                const SizedBox(height: 12),
              ],
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Entrar'),
              ),
              const SizedBox(height: 16),
              Text(
                'O PIN é definido pelo administrador no painel. O primeiro acesso precisa de internet; depois, a liberação do veículo funciona offline.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
