import 'package:flutter/material.dart';
import '../services/driver_session_service.dart';
import '../services/tenant_context.dart';

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
  TenantPreview? _preview; // marca da empresa (convite ou já lembrada)

  @override
  void initState() {
    super.initState();
    widget.service.savedTenantName().then((n) {
      if (!mounted) return;
      setState(() => _savedCompany = n);
      if (n != null) _loadPreview(n);
    });
    DriverSessionService.pendingInvite.addListener(_onInvite);
    _onInvite(); // convite que abriu o app
  }

  Future<void> _loadPreview(String company) async {
    final p = await widget.service.previewTenant(company);
    if (mounted) setState(() => _preview = p);
  }

  /// Convite (QR/link): troca para a empresa do convite e deixa só e-mail/senha.
  Future<void> _onInvite() async {
    final code = DriverSessionService.pendingInvite.value;
    if (code == null) return;
    DriverSessionService.pendingInvite.value = null;
    final p = await widget.service.previewTenant(code);
    if (!mounted) return;
    if (p == null) {
      setState(() => _error = 'Convite inválido: empresa "$code" não encontrada.');
      return;
    }
    await widget.service.forgetTenant();
    setState(() {
      _savedCompany = null;
      _company.text = code;
      _preview = p;
      _error = null;
    });
  }

  @override
  void dispose() {
    DriverSessionService.pendingInvite.removeListener(_onInvite);
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
    AppTenant.brand.value = null;
    if (mounted) setState(() {
      _savedCompany = null;
      _preview = null;
    });
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
              if (_preview?.settings.logoUrl != null)
                Image.network(_preview!.settings.logoUrl!, height: 72, alignment: Alignment.centerLeft,
                    errorBuilder: (_, __, ___) => Image.asset('assets/acn-logo.png', height: 72, alignment: Alignment.centerLeft))
              else
                Image.asset('assets/acn-logo.png', height: 72, alignment: Alignment.centerLeft),
              const SizedBox(height: 20),
              if (_preview != null && _savedCompany == null) ...[
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    border: Border.all(color: Theme.of(context).colorScheme.primary),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(children: [
                    const Icon(Icons.verified_outlined, size: 18),
                    const SizedBox(width: 8),
                    Expanded(child: Text('Convite da empresa ${_preview!.name}')),
                  ]),
                ),
                const SizedBox(height: 12),
              ],
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
