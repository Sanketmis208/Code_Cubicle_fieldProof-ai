import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/evidence_tile.dart';
import 'evidence_detail_screen.dart';

/// Cited reports for one project or the whole organization. Generating one
/// needs `report.create`; every sentence names the evidence it rests on.
class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key, this.project});

  final ProjectSummary? project;

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  List<ReportSummary>? _reports;
  String? _error;
  bool _generating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final reports = await AppScope.of(context).workspace.reports(projectId: widget.project?.id);
      if (mounted) setState(() { _reports = reports; _error = null; });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _generate() async {
    final state = AppScope.of(context);
    final project = widget.project!;
    final input = await showModalBottomSheet<({String title, String type})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => _NewReportSheet(projectName: project.name),
    );
    if (input == null || !mounted) return;
    setState(() => _generating = true);
    try {
      final report = await state.workspace.createReport(projectId: project.id, title: input.title, reportType: input.type);
      await _load();
      if (mounted) Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ReportDetailScreen(reportId: report.id)));
    } on ApiException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final reports = _reports;
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Reports', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          Text(widget.project?.name ?? 'Every project you can see', style: const TextStyle(fontSize: 12, color: Brand.stone)),
        ]),
      ),
      floatingActionButton: widget.project != null && state.can('report.create')
          ? FloatingActionButton.extended(
              backgroundColor: Brand.lime,
              foregroundColor: Brand.ink,
              onPressed: _generating ? null : _generate,
              icon: _generating ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Brand.ink)) : const Icon(Icons.auto_awesome_outlined),
              label: Text(_generating ? 'Writing…' : 'Generate report'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: reports == null
            ? ListView(children: [Padding(padding: const EdgeInsets.all(40), child: Center(child: _error == null ? const CircularProgressIndicator() : Text('$_error', style: const TextStyle(color: Brand.stone))))])
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                children: [
                  if (reports.isEmpty)
                    Padding(padding: const EdgeInsets.all(24), child: Text(widget.project == null ? 'No reports yet. Open a project to generate one.' : 'No reports yet. Generate one from this project\'s approved evidence.', textAlign: TextAlign.center, style: const TextStyle(color: Brand.stone))),
                  for (final report in reports)
                    Card(
                      elevation: 0,
                      color: Colors.white,
                      margin: const EdgeInsets.only(bottom: 10),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                      child: ListTile(
                        leading: const Icon(Icons.description_outlined, color: Brand.ink),
                        title: Text(report.title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                        subtitle: Text('${reportTypeLabels[report.reportType] ?? report.reportType} · ${report.projectName} · ${formatDay(report.updatedAt)}', style: const TextStyle(fontSize: 12)),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ReportDetailScreen(reportId: report.id)));
                          _load();
                        },
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class _NewReportSheet extends StatefulWidget {
  const _NewReportSheet({required this.projectName});

  final String projectName;

  @override
  State<_NewReportSheet> createState() => _NewReportSheetState();
}

class _NewReportSheetState extends State<_NewReportSheet> {
  late final _title = TextEditingController(text: '${widget.projectName} impact summary');
  String _type = 'IMPACT_SUMMARY';

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Generate a cited report', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 4),
        const Text('Approved, trusted evidence first; rejected evidence never appears. Each sentence cites what it rests on.', style: TextStyle(color: Brand.stone, fontSize: 13)),
        const SizedBox(height: 16),
        TextField(controller: _title, maxLength: 160, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Title')),
        DropdownButtonFormField<String>(
          value: _type,
          decoration: const InputDecoration(labelText: 'Type'),
          items: [for (final entry in reportTypeLabels.entries) DropdownMenuItem(value: entry.key, child: Text(entry.value))],
          onChanged: (value) => setState(() => _type = value ?? _type),
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: _title.text.trim().length < 3 ? null : () => Navigator.pop(context, (title: _title.text, type: _type)), child: const Text('Generate')),
      ]),
    );
  }
}

class ReportDetailScreen extends StatefulWidget {
  const ReportDetailScreen({super.key, required this.reportId});

  final String reportId;

  @override
  State<ReportDetailScreen> createState() => _ReportDetailScreenState();
}

class _ReportDetailScreenState extends State<ReportDetailScreen> {
  ReportDetail? _report;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final report = await AppScope.of(context).workspace.report(widget.reportId);
      if (mounted) setState(() => _report = report);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _delete() async {
    final state = AppScope.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete this report?'),
        content: const Text('The evidence it cites is not affected.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), style: TextButton.styleFrom(foregroundColor: const Color(0xFFB91C1C)), child: const Text('Delete')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await state.workspace.deleteReport(widget.reportId);
      if (mounted) Navigator.pop(context);
    } on ApiException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final report = _report;
    return Scaffold(
      appBar: AppBar(
        title: Text(report?.summary.title ?? 'Report', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16), overflow: TextOverflow.ellipsis),
        actions: [if (state.can('report.delete') && report != null) IconButton(tooltip: 'Delete', icon: const Icon(Icons.delete_outline), onPressed: _delete)],
      ),
      body: report == null
          ? Center(child: _error == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(32), child: Text(_error!, style: const TextStyle(color: Brand.stone))))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('${reportTypeLabels[report.summary.reportType] ?? report.summary.reportType} · ${report.summary.projectName} · ${formatDay(report.summary.updatedAt)}', style: const TextStyle(color: Brand.stone, fontSize: 12)),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: report.unsupportedClaims == 0 ? const Color(0xFFD1FAE5) : const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(16)),
                  child: Text(
                    report.unsupportedClaims == 0
                        ? 'Every one of the ${report.supportedClaims} sentences cites evidence.'
                        : '${report.supportedClaims} sentences cite evidence; ${report.unsupportedClaims} do not and are marked below.',
                    style: TextStyle(color: report.unsupportedClaims == 0 ? const Color(0xFF065F46) : const Color(0xFF92400E), fontWeight: FontWeight.w700, fontSize: 13),
                  ),
                ),
                const SizedBox(height: 12),
                _Section(title: 'Executive summary', child: Text(report.executiveSummary, style: const TextStyle(height: 1.5))),
                if (report.activities.isNotEmpty) _Section(title: 'Documented activities', child: _Claims(report.activities, report: report)),
                if (report.observations.isNotEmpty) _Section(title: 'Visible observations', child: _Claims(report.observations, report: report)),
                if (report.comparisons.isNotEmpty) _Section(title: 'Before and after', child: _Claims(report.comparisons, report: report)),
                if (report.gaps.isNotEmpty)
                  _Section(title: 'Evidence gaps', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final gap in report.gaps) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('• $gap', style: const TextStyle(height: 1.4)))])),
                if (report.methodology.isNotEmpty) _Section(title: 'How this was written', child: Text([report.methodology, if (report.disclaimer.isNotEmpty) report.disclaimer].join('\n\n'), style: const TextStyle(color: Brand.stone, height: 1.5, fontSize: 13))),
                if (report.evidence.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text('EVIDENCE CITED (${report.evidence.length})', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
                  const SizedBox(height: 8),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.82),
                    itemCount: report.evidence.length,
                    itemBuilder: (context, index) => EvidenceTile(
                      evidence: report.evidence[index],
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => EvidenceDetailScreen(evidenceId: report.evidence[index].id))),
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
          const SizedBox(height: 10),
          child,
        ]),
      );
}

class _Claims extends StatelessWidget {
  const _Claims(this.claims, {required this.report});

  final List<ReportClaim> claims;
  final ReportDetail report;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final claim in claims)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(claim.text, style: TextStyle(height: 1.4, color: claim.cited ? Brand.ink : Brand.stone)),
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Wrap(spacing: 6, runSpacing: 4, children: [
                  if (!claim.cited)
                    const _Tag('No citation', warn: true),
                  for (final id in claim.evidenceIds)
                    GestureDetector(
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => EvidenceDetailScreen(evidenceId: id))),
                      child: _Tag(report.labelFor(id)),
                    ),
                  for (var i = 0; i < claim.comparisonIds.length; i++) _Tag('Comparison ${i + 1}'),
                ]),
              ),
            ]),
          ),
      ]);
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, {this.warn = false});

  final String text;
  final bool warn;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: warn ? const Color(0xFFFEF3C7) : Brand.paper, borderRadius: BorderRadius.circular(99)),
        child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: warn ? const Color(0xFF92400E) : Brand.stone)),
      );
}
