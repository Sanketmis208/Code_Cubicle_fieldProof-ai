import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/evidence_tile.dart';
import 'assistant_screen.dart';
import 'evidence_detail_screen.dart';
import 'submissions_screen.dart';

/// What the organization looks like today: counts, what needs attention, the
/// newest evidence, and the phone's own sync state.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  DashboardSummary? _summary;
  List<Evidence> _recent = const [];
  String? _error;
  bool _loading = true;
  String? _loadedFor;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final orgId = AppScope.of(context).membership?.organization.id;
    if (orgId != _loadedFor) {
      _loadedFor = orgId;
      _load();
    }
  }

  Future<void> _load() async {
    final state = AppScope.of(context);
    setState(() {
      _loading = _summary == null;
      _error = null;
    });
    try {
      final results = await Future.wait([state.workspace.dashboard(), state.workspace.evidence(limit: 6)]);
      if (!mounted) return;
      setState(() {
        _summary = results[0] as DashboardSummary;
        _recent = results[1] as List<Evidence>;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final membership = state.membership;
    final summary = _summary;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(membership?.organization.name ?? 'FieldProof', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          Text('${state.user?.name ?? ''} · ${membership?.roleLabel ?? ''}', style: const TextStyle(fontSize: 12, color: Brand.stone)),
        ]),
        actions: [
          IconButton(
            tooltip: 'Ask FieldProof',
            icon: const Icon(Icons.chat_bubble_outline),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AssistantScreen())),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await state.refresh();
          await _load();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_loading) const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
            else if (_error != null && summary == null) _Notice(text: '$_error. Pull down to try again.')
            else if (summary != null) ...[
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.05,
                children: [
                  _Stat(value: summary.projects, label: 'Projects', icon: Icons.folder_outlined),
                  _Stat(value: summary.assets, label: 'Evidence', icon: Icons.photo_library_outlined),
                  _Stat(value: summary.pending, label: 'Awaiting review', icon: Icons.hourglass_bottom, highlight: summary.pending > 0),
                  _Stat(value: summary.analyzed, label: 'AI analyzed', icon: Icons.auto_awesome_outlined),
                  _Stat(value: summary.comparisons, label: 'Comparisons', icon: Icons.compare_outlined),
                  _Stat(value: summary.reports, label: 'Reports', icon: Icons.description_outlined),
                ],
              ),
              const SizedBox(height: 16),
            ],
            if (state.can('evidence.upload')) _SyncCard(state: state),
            const SizedBox(height: 20),
            Row(children: [
              const Expanded(child: Text('NEWEST EVIDENCE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone))),
              if (state.can('evidence.upload'))
                TextButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SubmissionsScreen())),
                  child: const Text('My submissions'),
                ),
            ]),
            if (_recent.isEmpty && !_loading)
              const _Notice(text: 'No evidence yet. Capture from the Capture tab, or upload from the web app.')
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.82),
                itemCount: _recent.length,
                itemBuilder: (context, index) => EvidenceTile(
                  evidence: _recent[index],
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => EvidenceDetailScreen(evidenceId: _recent[index].id))),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, required this.icon, this.highlight = false});

  final int value;
  final String label;
  final IconData icon;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: highlight ? const Color(0xFFFEF3C7) : Colors.white, borderRadius: BorderRadius.circular(18)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Icon(icon, size: 18, color: highlight ? const Color(0xFF92400E) : Brand.stone),
        TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: value.toDouble()),
          duration: const Duration(milliseconds: 700),
          curve: Curves.easeOutCubic,
          builder: (context, shown, _) => Text(shown.round().toString(), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Brand.ink)),
        ),
        Text(label, style: const TextStyle(fontSize: 11, color: Brand.stone)),
      ]),
    );
  }
}

class _SyncCard extends StatelessWidget {
  const _SyncCard({required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: state.queue,
      builder: (context, _) {
        final waiting = state.queue.waiting;
        final rows = <(IconData, String, bool)>[
          (Icons.schedule, state.clock.isTrusted ? 'Time synced with FieldProof' : 'Using phone clock until online', state.clock.isTrusted),
          (Icons.verified_user_outlined, state.device.ready ? 'This phone signs every capture' : 'Signing key not set up yet (needs a connection)', state.device.ready),
          (Icons.cloud_done_outlined, waiting == 0 ? 'Everything sent' : '$waiting waiting to send', waiting == 0),
        ];
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(24)),
          child: Column(children: [
            for (final (icon, text, ok) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  Icon(icon, size: 18, color: ok ? Brand.lime : const Color(0xFFFBBF24)),
                  const SizedBox(width: 10),
                  Expanded(child: Text(text, style: const TextStyle(color: Colors.white))),
                ]),
              ),
          ]),
        );
      },
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: const TextStyle(color: Brand.stone)),
    );
  }
}
