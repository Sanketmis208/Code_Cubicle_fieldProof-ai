import 'dart:io';

import 'package:flutter/material.dart';

import '../core/models.dart';
import '../services/capture_queue.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/trust_chip.dart';

/// Every capture from this phone: waiting, sent, or needing attention, with
/// the trust result and the reviewer's decision (including re-shoot requests).
class SubmissionsScreen extends StatefulWidget {
  const SubmissionsScreen({super.key});

  @override
  State<SubmissionsScreen> createState() => _SubmissionsScreenState();
}

class _SubmissionsScreenState extends State<SubmissionsScreen> {
  bool _refreshing = false;

  Future<void> _refresh(AppState state) async {
    setState(() => _refreshing = true);
    try {
      await state.queue.flush(state.api);
      await state.queue.refreshStatuses(state.api);
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return ListenableBuilder(
      listenable: state.queue,
      builder: (context, _) {
        final items = state.queue.items;
        return Scaffold(
          appBar: AppBar(
            title: const Text('My submissions', style: TextStyle(fontWeight: FontWeight.w800)),
            actions: [
              IconButton(
                tooltip: 'Send and refresh',
                onPressed: _refreshing ? null : () => _refresh(state),
                icon: _refreshing
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.sync),
              ),
            ],
          ),
          body: items.isEmpty
              ? const Center(child: Padding(padding: EdgeInsets.all(32), child: Text('Nothing captured on this phone yet.', style: TextStyle(color: Brand.stone))))
              : RefreshIndicator(
                  onRefresh: () => _refresh(state),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 10),
                    itemBuilder: (context, index) => _SubmissionTile(item: items[index], state: state),
                  ),
                ),
        );
      },
    );
  }
}

class _SubmissionTile extends StatelessWidget {
  const _SubmissionTile({required this.item, required this.state});

  final QueuedCapture item;
  final AppState state;

  @override
  Widget build(BuildContext context) {
    final file = File(item.filePath);
    final (String statusText, Color statusColor) = switch (item.status) {
      QueueStatus.pending => ('Waiting to send · ${item.sizeKb} KB', const Color(0xFFD97706)),
      QueueStatus.sending => ('Sending ${item.sizeKb} KB…', const Color(0xFF2563EB)),
      QueueStatus.sent => ('Sent · ${item.sizeKb} KB', const Color(0xFF059669)),
      QueueStatus.failed => ('Not accepted', const Color(0xFFB91C1C)),
    };
    final review = item.reviewStatus;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: SizedBox(
            width: 72,
            height: 72,
            child: file.existsSync()
                ? Image.file(file, fit: BoxFit.cover, cacheWidth: 216)
                : const ColoredBox(color: Brand.paper, child: Icon(Icons.image_outlined, color: Brand.stone)),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.projectName, style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(statusText, style: TextStyle(color: statusColor, fontWeight: FontWeight.w600, fontSize: 13)),
            if (item.error != null && item.status != QueueStatus.sent)
              Text(item.error!, style: const TextStyle(color: Brand.stone, fontSize: 12)),
            const SizedBox(height: 6),
            Wrap(spacing: 6, runSpacing: 6, children: [
              if (item.trustStatus != null) TrustChip(status: item.trustStatus, score: item.trustScore),
              if (review != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: review == 'RESHOOT_REQUESTED'
                        ? const Color(0xFFEDE9FE)
                        : review == 'APPROVED'
                            ? const Color(0xFF059669)
                            : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    review == 'REMOVED' ? 'Removed by your team' : reviewLabels[review] ?? review,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: review == 'APPROVED' ? Colors.white : Brand.ink),
                  ),
                ),
            ]),
            if (item.reviewNote != null && review != 'APPROVED') ...[
              const SizedBox(height: 6),
              Text('Reviewer: ${item.reviewNote}', style: const TextStyle(fontSize: 12, color: Brand.stone)),
            ],
          ]),
        ),
        if (item.status == QueueStatus.failed || item.status == QueueStatus.pending)
          IconButton(tooltip: 'Try again now', icon: const Icon(Icons.refresh), onPressed: () => state.queue.retry(state.api, item)),
      ]),
    );
  }
}
