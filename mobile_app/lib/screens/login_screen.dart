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
  final _company = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _savedCompany; // empresa já lembrada neste celular

  @override
  void initState() {
    super.initState();
    widget.service.savedTenantName().then((n) {
      if (mounted) setState(() => _savedCompany = n);
    });
  }

  @override
  void dispose() {
    _company.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final (result, session) = await widget.service.login(
      company: _savedCompany == null ? _company.text : null,
      email: _email.text,
      password: _password.text,
    );
    if (!mounted) return;
    switch (result) {
      case LoginResult.ok:
        widget.onLoggedIn(session!);
        return;
      case LoginResult.invalid:
        _error = 'E-mail ou senha incorretos.';
      case LoginResult.locked:
        _error = 'Muitas tentativas. Conta bloqueada por 15 minutos — ou peça uma nova senha ao administrador.';
      case LoginResult.tenantNotFound:
        _error = 'Empresa não encontrada. Confira o nome (ou o código) informado pelo administrador.';
      case LoginResult.offline:
        _error = 'Sem conexão com o servidor. O primeiro acesso precisa de internet.';
    }
    setState(() => _busy = false);
  }

  Future<void> _changeCompany() async {
    await widget.service.forgetTenant();
    if (mounted) setState(() => _savedCompany = null);
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
              const SizedBox(height: 8),
              Image.asset('assets/acn-logo.png', height: 72, alignment: Alignment.centerLeft),
              const SizedBox(height: 20),
              if (_savedCompany == null)
                TextFormField(
                  controller: _company,
                  decoration: const InputDecoration(
                    labelText: 'Empresa',
                    helperText: 'Só no primeiro acesso: nome (ou código) da sua empresa.',
                  ),
                  textInputAction: TextInputAction.next,
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Obrigatório' : null,
                )
              else
                Row(
                  children: [
                    const Icon(Icons.business, size: 18),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_savedCompany!, style: Theme.of(context).textTheme.titleMedium)),
                    TextButton(onPressed: _changeCompany, child: const Text('Trocar')),
                  ],
                ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _email,
                decoration: const InputDecoration(labelText: 'E-mail'),
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                textInputAction: TextInputAction.next,
                validator: (v) => (v == null || !v.contains('@')) ? 'E-mail inválido' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _password,
                decoration: const InputDecoration(labelText: 'Senha'),
                obscureText: true,
                onFieldSubmitted: (_) => _submit(),
                validator: (v) => (v == null || v.isEmpty) ? 'Obrigatório' : null,
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
                'E-mail e senha são cadastrados pelo administrador da sua empresa no painel. O primeiro acesso precisa de internet; depois, a liberação do veículo funciona offline.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
