import 'package:flutter/material.dart';

/// FieldProof brand: deep ink, signal lime, paper.
class Brand {
  Brand._();

  static const ink = Color(0xFF0B1714);
  static const lime = Color(0xFFB9F459);
  static const paper = Color(0xFFF2F0E8);
  static const stone = Color(0xFF60706A);

  static ThemeData theme() {
    final scheme = ColorScheme.fromSeed(seedColor: ink, primary: ink, secondary: lime, surface: paper);
    return ThemeData(
      colorScheme: scheme,
      scaffoldBackgroundColor: paper,
      useMaterial3: true,
      appBarTheme: const AppBarTheme(backgroundColor: paper, foregroundColor: ink, elevation: 0, centerTitle: false),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: ink,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: const StadiumBorder(),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
    );
  }
}
