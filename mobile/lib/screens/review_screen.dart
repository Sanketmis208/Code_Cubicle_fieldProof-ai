import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/trust_chip.dart';
import 'evidence_detail_screen.dart';

/// The reviewer's queue: riskiest first, grouped by event, decisions in two
/// taps, and nobody approving their own upload.
class ReviewScreen extends StatefulWidget {
  const ReviewScreen({super.key});

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  List<Evidence>? _items;
  Map<String, int> _counts = const {};
  bool _selfReviewAllowed = false;
  String? _error;
  String? _loadedFor;
  final Set<String> _busy = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final orgId = AppScope.of(context).membership?.organization.id;
    if (orgId != _loadedFor) {
      _loadedFor = orgId;
      _items = null;
      _load();
    }
  }

  Future<void> _load() async {
    try {
      final queue = await AppScope.of(context).workspace.reviewQueue();
      if (!mounted) return;
      setState(() {
        _items = queue.items;
        _counts = queue.counts;
        _selfReviewAllowed = queue.selfReviewAllowed;
        _error = null;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _decide(Evidence item, String decision) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    String? note;
    if (decision != 'APPROVED') {
      note = await _askReason(decision == 'REJECTED' ? 'Why is this rejected?' : 'What should the re-shoot capture?');
      if (note == null) return;
    }
    if (!mounted) return;
    setState(() => _busy.add(item.id));
    try {
      await state.workspace.review(item.id, decision, note: note);
      messenger.showSnackBar(SnackBar(content: Text(reviewLabels[decision] ?? decision)));
      await _load();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _busy.remove(item.id));
    }
  }

  Future<void> _approveEvent(String clusterId) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await state.workspace.reviewEvent(clusterId);
      messenger.showSnackBar(SnackBar(content: Text('${result.reviewed} approved${result.left > 0 ? ' · ${result.left} left for individual review' : ''}')));
      await _load();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<String?> _askReason(String prompt) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(prompt, style: const TextStyle(fontSize: 16)),
        content: TextField(controller: controller, autofocus: true, maxLength: 500, decoration: const InputDecoration(hintText: 'The field worker will see this')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: const Text('Send')),
        ],
      ),
    );
    controller.dispose();
    if (result != null && result.length < 3) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please give a short reason')));
      return null;
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    // Group by event, keeping riskiest-first order of each group's first item.
    final groups = <String, List<Evidence>>{};
    for (final item in items ?? const <Evidence>[]) {
      groups.putIfAbsent(item.eventClusterId ?? item.id, () => []).add(item);
    }
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Review', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          Text('${_counts['PENDING'] ?? 0} to review · ${_counts['APPROVED'] ?? 0} approved · ${_counts['REJECTED'] ?? 0} rejected', style: const TextStyle(fontSize: 12, color: Brand.stone)),
        ]),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: items == null
            ? ListView(children: [Padding(padding: const EdgeInsets.all(40), child: Center(child: _error == null ? const CircularProgressIndicator() : Text('$_error. Pull down to try again.', style: const TextStyle(color: Brand.stone))))])
            : items.isEmpty
                ? ListView(children: const [Padding(padding: EdgeInsets.all(40), child: Center(child: Text('Nothing waiting for review. New uploads appear here, riskiest first.', textAlign: TextAlign.center, style: TextStyle(color: Brand.stone))))])
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      for (final entry in groups.entries) ...[
                        if (entry.value.length > 1)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6, top: 6),
                            child: Row(children: [
                              Expanded(child: Text('One event · ${entry.value.length} shots', style: const TextStyle(fontWeight: FontWeight.w700))),
                              TextButton.icon(onPressed: () => _approveEvent(entry.key), icon: const Icon(Icons.done_all, size: 18), label: const Text('Approve whole event')),
                            ]),
                          ),
                        for (final item in entry.value) _ReviewCard(item: item, busy: _busy.contains(item.id), blocked: item.ownUpload && !_selfReviewAllowed, onDecide: (decision) => _decide(item, decision)),
                      ],
                    ],
                  ),
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.item, required this.busy, required this.blocked, required this.onDecide});

  final Evidence item;
  final bool busy;
  final bool blocked;
  final void Function(String decision) onDecide;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InkWell(
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => EvidenceDetailScreen(evidenceId: item.id))),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(width: 96, height: 72, child: Image.network(item.thumbnail(width: 288, height: 216), fit: BoxFit.cover, errorBuilder: (c, e, s) => const ColoredBox(color: Brand.paper))),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 6, runSpacing: 4, children: [
                  TrustChip(status: item.trustStatus, score: item.trustScore),
                  if (item.ownUpload) const _Tag('Your upload'),
                ]),
                const SizedBox(height: 4),
                Text(item.filename, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('${item.projectName} · ${item.uploaderName ?? 'former member'} · ${formatDayTime(item.createdAt)}', style: const TextStyle(color: Brand.stone, fontSize: 11)),
                if (item.flags.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Wrap(spacing: 4, runSpacing: 4, children: [for (final flag in item.flags.take(3)) _Tag(checkLabels[flag.check] ?? flag.check, warn: true)]),
                ],
              ]),
            ),
          ]),
        ),
        if (item.flags.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(item.flags.first.message, style: const TextStyle(fontSize: 12, color: Color(0xFF78350F))),
        ],
        const SizedBox(height: 10),
        if (blocked)
          const Text('You uploaded this; another reviewer must decide.', style: TextStyle(color: Brand.stone, fontSize: 12))
        else
          Row(children: [
            Expanded(child: FilledButton(onPressed: busy ? null : () => onDecide('APPROVED'), style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(40)), child: const Text('Approve'))),
            const SizedBox(width: 8),
            OutlinedButton(onPressed: busy ? null : () => onDecide('RESHOOT_REQUESTED'), child: const Text('Re-shoot')),
            const SizedBox(width: 8),
            OutlinedButton(onPressed: busy ? null : () => onDecide('REJECTED'), style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFB91C1C)), child: const Text('Reject')),
          ]),
      ]),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, {this.warn = false});

  final String text;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: warn ? const Color(0xFFFEF3C7) : const Color(0xFFEDE9FE), borderRadius: BorderRadius.circular(8)),
      child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: warn ? const Color(0xFF78350F) : const Color(0xFF4C1D95))),
    );
  }
}
