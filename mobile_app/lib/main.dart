import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/supabase_config.dart';
import 'screens/auth_flow_screen.dart';

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
      home: const AuthFlowScreen(),
    );
  }
}
