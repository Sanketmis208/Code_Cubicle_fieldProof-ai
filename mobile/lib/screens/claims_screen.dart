import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/evidence_tile.dart';
import 'evidence_detail_screen.dart';

/// Claim checker: paste a sentence from a report and see the evidence and the
/// confirmed counts behind it. Same endpoint and verdict as the web app.
class ClaimsScreen extends StatefulWidget {
  const ClaimsScreen({super.key, this.projectId, this.projectName});

  final String? projectId;
  final String? projectName;

  @override
  State<ClaimsScreen> createState() => _ClaimsScreenState();
}

class _ClaimsScreenState extends State<ClaimsScreen> {
  final _claim = TextEditingController();
  ClaimResult? _result;
  bool _busy = false;
  String? _error;

  static const _examples = ['We planted 500 saplings in Plot B this month', 'Water tanks were installed in all three villages', 'Classes ran every week in August'];

  @override
  void dispose() {
    _claim.dispose();
    super.dispose();
  }

  Future<void> _check([String? text]) async {
    final claim = (text ?? _claim.text).trim();
    if (claim.length < 8 || _busy) return;
    if (text != null) _claim.text = text;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await AppScope.of(context).workspace.checkClaim(claim, projectId: widget.projectId);
      if (mounted) setState(() => _result = result);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = _result;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Claim checker', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          Text(widget.projectName == null ? 'Across every project you can see' : 'In ${widget.projectName}', style: const TextStyle(fontSize: 12, color: Brand.stone)),
        ]),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _claim,
            maxLines: 3,
            maxLength: 600,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _check(),
            decoration: const InputDecoration(hintText: 'Paste a sentence from a report, e.g. "500 trees planted in Plot B in August"'),
          ),
          FilledButton.icon(onPressed: _busy ? null : _check, icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.fact_check_outlined), label: Text(_busy ? 'Checking…' : 'Check this claim')),
          if (result == null && !_busy) ...[
            const SizedBox(height: 16),
            const Text('TRY ONE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
            const SizedBox(height: 8),
            for (final example in _examples)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: OutlinedButton(onPressed: () => _check(example), style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft, backgroundColor: Colors.white), child: Text(example)),
              ),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Color(0xFFB91C1C)))),
          if (result != null) ...[
            const SizedBox(height: 16),
            _VerdictCard(result: result),
            const SizedBox(height: 12),
            _CountsRow(counts: result.counts),
            if (result.tallied != null) ...[
              const SizedBox(height: 12),
              _TalliedCard(tallied: result.tallied!),
            ],
            if (result.gaps.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('WHAT IS MISSING', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
                  const SizedBox(height: 8),
                  for (final gap in result.gaps)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Icon(Icons.warning_amber_rounded, size: 16, color: Color(0xFFB45309)),
                        const SizedBox(width: 8),
                        Expanded(child: Text(gap, style: const TextStyle(fontSize: 13, height: 1.4))),
                      ]),
                    ),
                ]),
              ),
            ],
            const SizedBox(height: 16),
            Text('EVIDENCE CITED (${result.evidence.length})', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
            const SizedBox(height: 8),
            if (result.evidence.isEmpty)
              const Text('No evidence matches this claim.', style: TextStyle(color: Brand.stone))
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.82),
                itemCount: result.evidence.length,
                itemBuilder: (context, index) => EvidenceTile(
                  evidence: result.evidence[index],
                  onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => EvidenceDetailScreen(evidenceId: result.evidence[index].id))),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _VerdictCard extends StatelessWidget {
  const _VerdictCard({required this.result});

  final ClaimResult result;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg, IconData icon) = switch (result.verdict) {
      'SUPPORTED' => (const Color(0xFF059669), Colors.white, Icons.verified),
      'PARTIAL' => (const Color(0xFFFEF3C7), const Color(0xFF92400E), Icons.rule),
      _ => (const Color(0xFFFEE2E2), const Color(0xFFB91C1C), Icons.help_outline),
    };
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Row(children: [
        Icon(icon, color: fg, size: 30),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(claimVerdictLabels[result.verdict] ?? result.verdict, style: TextStyle(color: fg, fontWeight: FontWeight.w900, fontSize: 18)),
            Text('“${result.claim}”', style: TextStyle(color: fg, fontSize: 13), maxLines: 3, overflow: TextOverflow.ellipsis),
          ]),
        ),
      ]),
    );
  }
}

class _CountsRow extends StatelessWidget {
  const _CountsRow({required this.counts});

  final Map<String, int> counts;

  @override
  Widget build(BuildContext context) {
    final cells = [
      ('matching', 'Matching'),
      ('approved', 'Approved'),
      ('trusted', 'Trusted'),
      ('needsSecondLook', 'Second look'),
      ('insideSite', 'Inside a site'),
      ('events', 'Events'),
    ];
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 1.6,
      children: [
        for (final (key, label) in cells)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
              Text('${counts[key] ?? 0}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              Text(label, style: const TextStyle(fontSize: 11, color: Brand.stone)),
            ]),
          ),
      ],
    );
  }
}

class _TalliedCard extends StatelessWidget {
  const _TalliedCard({required this.tallied});

  final ({String label, int confirmed, int recorded}) tallied;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('COUNTED, NOT JUST PICTURED', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.lime)),
        const SizedBox(height: 8),
        Text('${tallied.confirmed} confirmed · ${tallied.recorded} recorded', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
        Text('from target “${tallied.label}”. Photos show the activity happened; confirmed batches say how many.', style: const TextStyle(color: Colors.white70, fontSize: 12, height: 1.4)),
      ]),
    );
  }
}
