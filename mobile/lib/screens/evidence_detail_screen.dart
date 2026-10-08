import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/trust_chip.dart';

/// One piece of evidence: the picture, where its facts came from, every trust
/// check with its reason, and the review decision (which reviewers can make here).
class EvidenceDetailScreen extends StatefulWidget {
  const EvidenceDetailScreen({super.key, required this.evidenceId});

  final String evidenceId;

  @override
  State<EvidenceDetailScreen> createState() => _EvidenceDetailScreenState();
}

class _EvidenceDetailScreenState extends State<EvidenceDetailScreen> {
  Evidence? _evidence;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final evidence = await AppScope.of(context).workspace.evidenceDetail(widget.evidenceId);
      if (mounted) setState(() { _evidence = evidence; _error = null; });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _decide(String decision) async {
    final state = AppScope.of(context);
    String? note;
    if (decision != 'APPROVED') {
      note = await _askReason(decision == 'REJECTED' ? 'Why is this rejected? The field worker will see this.' : 'What should the re-shoot capture?');
      if (note == null) return;
    }
    if (!mounted) return;
    setState(() => _busy = true);
    try {
      await state.workspace.review(widget.evidenceId, decision, note: note);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(reviewLabels[decision] ?? decision)));
    } on ApiException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _askReason(String prompt) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(prompt, style: const TextStyle(fontSize: 16)),
        content: TextField(controller: controller, autofocus: true, maxLength: 500, decoration: const InputDecoration(hintText: 'Short reason')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: const Text('Send')),
        ],
      ),
    );
    controller.dispose();
    if (result == null) return null;
    if (result.length < 3) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please give a short reason')));
      return null;
    }
    return result;
  }

  Future<void> _analyze() async {
    setState(() => _busy = true);
    try {
      await AppScope.of(context).workspace.analyze(widget.evidenceId);
      await _load();
    } on ApiException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final evidence = _evidence;
    return Scaffold(
      appBar: AppBar(title: Text(evidence?.filename ?? 'Evidence', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16), overflow: TextOverflow.ellipsis)),
      body: evidence == null
          ? Center(child: _error == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(32), child: Text(_error!, style: const TextStyle(color: Brand.stone))))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: AspectRatio(
                      aspectRatio: 4 / 3,
                      child: Image.network(evidence.thumbnail(width: 1200, height: 900), fit: BoxFit.cover, errorBuilder: (c, e, s) => const ColoredBox(color: Brand.paper)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    TrustChip(status: evidence.trustStatus, score: evidence.trustScore),
                    _Pill(reviewLabels[evidence.reviewStatus] ?? evidence.reviewStatus, strong: evidence.reviewStatus == 'APPROVED'),
                    _Pill(evidence.sourceLabel),
                  ]),
                  const SizedBox(height: 16),
                  _Section(title: 'Facts', children: [
                    _Fact('Project', evidence.projectName),
                    _Fact('Captured', evidence.capturedAt == null ? 'Unknown; upload time used' : formatDayTime(evidence.capturedAt!)),
                    _Fact('Uploaded', formatDayTime(evidence.createdAt)),
                    _Fact('Site', evidence.siteName ?? 'Not inside a defined site'),
                    if (evidence.eventCount != null && evidence.eventCount! > 1) _Fact('Event', 'One of ${evidence.eventCount} shots of the same moment'),
                    if (evidence.activity != null) _Fact('Activity', evidence.activity!),
                    if (evidence.summary != null) _Fact('AI observed', evidence.summary!),
                  ]),
                  const SizedBox(height: 12),
                  _Section(title: 'Why this score', children: [
                    if (evidence.checks.isEmpty) const Text('Trust has not been assessed yet.', style: TextStyle(color: Brand.stone)),
                    for (final check in evidence.checks) _CheckRow(check: check),
                  ]),
                  if (evidence.reviewNote != null) ...[
                    const SizedBox(height: 12),
                    _Section(title: 'Reviewer note', children: [Text(evidence.reviewNote!)]),
                  ],
                  const SizedBox(height: 16),
                  if (state.can('evidence.review') && evidence.reviewStatus == 'PENDING') ...[
                    if (evidence.ownUpload)
                      const Padding(padding: EdgeInsets.only(bottom: 8), child: Text('You uploaded this; another reviewer must decide.', style: TextStyle(color: Brand.stone, fontSize: 12)))
                    else
                      Row(children: [
                        Expanded(child: FilledButton.icon(onPressed: _busy ? null : () => _decide('APPROVED'), icon: const Icon(Icons.check), label: const Text('Approve'))),
                        const SizedBox(width: 8),
                        OutlinedButton(onPressed: _busy ? null : () => _decide('RESHOOT_REQUESTED'), child: const Icon(Icons.photo_camera_outlined)),
                        const SizedBox(width: 8),
                        OutlinedButton(onPressed: _busy ? null : () => _decide('REJECTED'), style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFB91C1C)), child: const Icon(Icons.close)),
                      ]),
                  ],
                  if (state.can('evidence.analyze') && evidence.aiStatus != 'COMPLETED' && !evidence.isVideo && evidence.resourceType != 'RAW') ...[
                    const SizedBox(height: 8),
                    TextButton.icon(onPressed: _busy ? null : _analyze, icon: const Icon(Icons.auto_awesome_outlined), label: Text(evidence.aiStatus == 'FAILED' ? 'Retry AI analysis' : 'Run AI analysis')),
                  ],
                ],
              ),
            ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
        const SizedBox(height: 10),
        ...children,
      ]),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 88, child: Text(label, style: const TextStyle(fontSize: 12, color: Brand.stone, fontWeight: FontWeight.w700))),
        Expanded(child: Text(value, style: const TextStyle(fontSize: 14))),
      ]),
    );
  }
}

class _CheckRow extends StatelessWidget {
  const _CheckRow({required this.check});

  final TrustCheck check;

  @override
  Widget build(BuildContext context) {
    final (IconData icon, Color color) = switch (check.result) {
      'PASS' => (Icons.check_circle_outline, const Color(0xFF047857)),
      'WARN' => (Icons.warning_amber_rounded, const Color(0xFFB45309)),
      'FAIL' => (Icons.error_outline, const Color(0xFFB91C1C)),
      _ => (Icons.info_outline, const Color(0xFF0369A1)),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${checkLabels[check.check] ?? check.check}${check.weight != 0 ? '  ${check.weight > 0 ? '+' : ''}${check.weight}' : ''}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Brand.stone, letterSpacing: 1)),
            Text(check.message, style: const TextStyle(fontSize: 14)),
          ]),
        ),
      ]),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text, {this.strong = false});

  final String text;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: strong ? const Color(0xFF059669) : const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(99)),
      child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: strong ? Colors.white : Brand.ink)),
    );
  }
}
