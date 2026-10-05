import 'package:flutter/material.dart';

import '../core/models.dart';

/// Trust score and status, coloured like the web app.
class TrustChip extends StatelessWidget {
  const TrustChip({super.key, required this.status, this.score});

  final String? status;
  final int? score;

  @override
  Widget build(BuildContext context) {
    final value = status ?? 'NOT_ASSESSED';
    final (Color background, Color foreground) = switch (value) {
      'STRONG' => (const Color(0xFFD1FAE5), const Color(0xFF064E3B)),
      'MODERATE' => (const Color(0xFFE0F2FE), const Color(0xFF0C4A6E)),
      'NEEDS_SECOND_LOOK' => (const Color(0xFFFEF3C7), const Color(0xFF78350F)),
      _ => (const Color(0xFFF1F5F9), const Color(0xFF475569)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(99)),
      child: Text(
        score == null ? trustLabels[value] ?? value : '$score · ${trustLabels[value] ?? value}',
        style: TextStyle(color: foreground, fontWeight: FontWeight.w700, fontSize: 12),
      ),
    );
  }
}
