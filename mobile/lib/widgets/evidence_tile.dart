import 'package:flutter/material.dart';

import '../core/models.dart';
import '../theme.dart';
import 'trust_chip.dart';

/// A photo card with its trust and review state, as used in grids and lists.
class EvidenceTile extends StatelessWidget {
  const EvidenceTile({super.key, required this.evidence, required this.onTap});

  final Evidence evidence;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          AspectRatio(
            aspectRatio: 4 / 3,
            child: Stack(fit: StackFit.expand, children: [
              Image.network(
                evidence.thumbnail(),
                fit: BoxFit.cover,
                errorBuilder: (context, error, stack) => const ColoredBox(color: Brand.paper, child: Icon(Icons.broken_image_outlined, color: Brand.stone)),
                loadingBuilder: (context, child, progress) => progress == null ? child : const ColoredBox(color: Brand.paper),
              ),
              if (evidence.isVideo) const Center(child: Icon(Icons.play_circle_fill, color: Colors.white, size: 36)),
              Positioned(left: 8, bottom: 8, child: TrustChip(status: evidence.trustStatus, score: evidence.trustScore)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(evidence.filename, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 2),
              Text(
                '${reviewLabels[evidence.reviewStatus] ?? evidence.reviewStatus} · ${evidence.sourceLabel}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Brand.stone, fontSize: 11),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
