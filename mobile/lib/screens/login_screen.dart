import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';

/// Sign in, or join an organization with the invite code a coordinator shared
/// (field workers rarely have a work email or a laptop).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  bool _joining = false;
  bool _busy = false;
  bool _showPassword = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_joining) {
        await state.joinWithInvite(name: _name.text, email: _email.text, password: _password.text, code: _code.text);
      } else {
        await state.signIn(_email.text, _password.text);
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Something went wrong. Check the connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _required(String? value) => (value == null || value.trim().isEmpty) ? 'Required' : null;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: const BoxDecoration(color: Brand.lime, shape: BoxShape.circle),
                      child: const Icon(Icons.eco, color: Brand.ink),
                    ),
                    const SizedBox(width: 12),
                    const Text('FIELDPROOF', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: -0.5)),
                  ]),
                  const SizedBox(height: 32),
                  Text(
                    _joining ? 'Join your team' : 'Capture evidence\nyou can stand behind.',
                    style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900, height: 1.05, color: Brand.ink),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _joining
                        ? 'Enter the invite code your coordinator sent you.'
                        : 'Photos are taken live, signed on this phone, and stamped with place and trusted time.',
                    style: const TextStyle(color: Brand.stone),
                  ),
                  const SizedBox(height: 28),
                  if (_joining) ...[
                    TextFormField(
                      controller: _code,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(labelText: 'Invite code', hintText: 'ABCD-2345'),
                      validator: (value) => (value ?? '').replaceAll(RegExp('[^A-Za-z0-9]'), '').length < 8 ? 'Enter the 8-character code' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(labelText: 'Your name'),
                      validator: (value) => (value ?? '').trim().length < 2 ? 'Enter your name' : null,
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(labelText: 'Email'),
                    validator: _required,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _password,
                    obscureText: !_showPassword,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Password',
                      helperText: _joining ? '8+ characters, one capital letter and one number' : null,
                      suffixIcon: IconButton(
                        tooltip: _showPassword ? 'Hide password' : 'Show password',
                        icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility),
                        onPressed: () => setState(() => _showPassword = !_showPassword),
                      ),
                    ),
                    validator: _required,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C), fontWeight: FontWeight.w600)),
                  ],
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                        : Text(_joining ? 'Join and sign in' : 'Sign in'),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _busy ? null : () => setState(() {
                      _joining = !_joining;
                      _error = null;
                    }),
                    child: Text(_joining ? 'I already have an account' : 'I have an invite code'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
