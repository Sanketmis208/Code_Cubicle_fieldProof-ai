import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'state/app_state.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState()..start();
  runApp(FieldProofApp(state: state));
}

class FieldProofApp extends StatelessWidget {
  const FieldProofApp({super.key, required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: state,
      child: MaterialApp(
        title: 'FieldProof Capture',
        debugShowCheckedModeBanner: false,
        theme: Brand.theme(),
        home: const _Root(),
      ),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return switch (state.status) {
      SessionStatus.loading => const Scaffold(body: Center(child: CircularProgressIndicator())),
      SessionStatus.signedOut => const LoginScreen(),
      SessionStatus.signedIn => const HomeScreen(),
    };
  }
}
