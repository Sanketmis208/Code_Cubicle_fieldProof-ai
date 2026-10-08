import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/geo.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/evidence_tile.dart';
import 'capture_screen.dart';
import 'evidence_detail_screen.dart';

/// One project: its evidence, its targets ("how many?") and its sites.
class ProjectDetailScreen extends StatefulWidget {
  const ProjectDetailScreen({super.key, required this.project});

  final ProjectSummary project;

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  List<Evidence>? _evidence;
  List<Target>? _targets;
  List<Site>? _sites;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = AppScope.of(context).workspace;
    try {
      final results = await Future.wait<Object>([
        api.evidence(projectId: widget.project.id),
        api.targets(widget.project.id),
        api.sites(widget.project.id),
      ]);
      if (!mounted) return;
      setState(() {
        _evidence = results[0] as List<Evidence>;
        _targets = results[1] as List<Target>;
        _sites = results[2] as List<Site>;
        _error = null;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  CaptureProject get _captureProject => CaptureProject(id: widget.project.id, name: widget.project.name, location: widget.project.location, sites: _sites ?? const []);

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.project.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        bottom: TabBar(
          controller: _tabs,
          labelColor: Brand.ink,
          indicatorColor: Brand.ink,
          tabs: [
            Tab(text: 'Evidence${_evidence == null ? '' : ' (${_evidence!.length})'}'),
            Tab(text: 'Targets${_targets == null ? '' : ' (${_targets!.length})'}'),
            Tab(text: 'Sites${_sites == null ? '' : ' (${_sites!.length})'}'),
          ],
        ),
      ),
      floatingActionButton: state.can('evidence.upload')
          ? FloatingActionButton.extended(
              backgroundColor: Brand.lime,
              foregroundColor: Brand.ink,
              icon: const Icon(Icons.photo_camera),
              label: const Text('Capture'),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CaptureScreen(project: _captureProject))),
            )
          : null,
      body: _error != null && _evidence == null
          ? Center(child: Padding(padding: const EdgeInsets.all(32), child: Text('$_error', style: const TextStyle(color: Brand.stone))))
          : TabBarView(controller: _tabs, children: [
              _EvidenceTab(evidence: _evidence, onRefresh: _load),
              _TargetsTab(project: widget.project, targets: _targets, sites: _sites ?? const [], onRefresh: _load),
              _SitesTab(sites: _sites, onRefresh: _load),
            ]),
    );
  }
}

class _EvidenceTab extends StatelessWidget {
  const _EvidenceTab({required this.evidence, required this.onRefresh});

  final List<Evidence>? evidence;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final items = evidence;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: items == null
          ? const Center(child: CircularProgressIndicator())
          : items.isEmpty
              ? ListView(children: const [Padding(padding: EdgeInsets.all(40), child: Center(child: Text('No evidence yet.', style: TextStyle(color: Brand.stone))))])
              : GridView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.82),
                  itemCount: items.length,
                  itemBuilder: (context, index) => EvidenceTile(
                    evidence: items[index],
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => EvidenceDetailScreen(evidenceId: items[index].id))),
                  ),
                ),
    );
  }
}

class _TargetsTab extends StatelessWidget {
  const _TargetsTab({required this.project, required this.targets, required this.sites, required this.onRefresh});

  final ProjectSummary project;
  final List<Target>? targets;
  final List<Site> sites;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final items = targets;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: items == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
              children: [
                if (items.isEmpty)
                  const Padding(padding: EdgeInsets.all(24), child: Text('No targets set. An admin or program manager sets targets such as "500 saplings" on the web app; batches are recorded here.', textAlign: TextAlign.center, style: TextStyle(color: Brand.stone))),
                for (final target in items) _TargetCard(project: project, target: target, sites: sites, canRecord: state.can('evidence.upload'), canReview: state.can('evidence.review'), onChanged: onRefresh),
              ],
            ),
    );
  }
}

class _TargetCard extends StatelessWidget {
  const _TargetCard({required this.project, required this.target, required this.sites, required this.canRecord, required this.canReview, required this.onChanged});

  final ProjectSummary project;
  final Target target;
  final List<Site> sites;
  final bool canRecord;
  final bool canReview;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(target.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 4),
        Text('${target.confirmed} confirmed of ${target.targetCount} ${target.unit} · ${target.recorded - target.confirmed} awaiting review', style: const TextStyle(color: Brand.stone, fontSize: 13)),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: Stack(children: [
            LinearProgressIndicator(value: target.recordedFraction, minHeight: 10, backgroundColor: Brand.paper, color: const Color(0xFFFCD34D)),
            LinearProgressIndicator(value: target.confirmedFraction, minHeight: 10, backgroundColor: Colors.transparent, color: const Color(0xFF059669)),
          ]),
        ),
        const SizedBox(height: 6),
        Text('${target.withEvidence} backed by photos · ${target.batches} batch${target.batches == 1 ? '' : 'es'}', style: const TextStyle(color: Brand.stone, fontSize: 11)),
        if (canRecord) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _recordBatch(context),
            icon: const Icon(Icons.tag),
            label: Text('Record a batch of ${target.unit}'),
          ),
        ],
        for (final tally in target.tallies.take(6)) ...[
          const Divider(height: 20),
          Row(children: [
            Text('${tally.count}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                [formatDay(tally.recordedAt), if (tally.siteName != null) tally.siteName!, if (tally.eventCount != null) '${tally.eventCount} photos', if (tally.note != null) '“${tally.note}”'].join(' · '),
                style: const TextStyle(color: Brand.stone, fontSize: 12),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (tally.reviewStatus == 'PENDING' && canReview && tally.recordedById != state.user?.id)
              IconButton(tooltip: 'Confirm count', icon: const Icon(Icons.check_circle_outline, color: Color(0xFF059669)), onPressed: () => _review(context, tally.id, 'APPROVED'))
            else
              Text(reviewLabels[tally.reviewStatus] ?? tally.reviewStatus, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Brand.stone)),
          ]),
        ],
      ]),
    );
  }

  Future<void> _review(BuildContext context, String tallyId, String decision) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await state.workspace.reviewTally(tallyId, decision);
      await onChanged();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _recordBatch(BuildContext context) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    List<ProjectEvent> events = const [];
    try {
      events = await state.workspace.events(project.id);
    } on ApiException {
      // Linking photos is optional; the form still works.
    }
    if (!context.mounted) return;
    final result = await showModalBottomSheet<({int count, String? siteId, String? eventId, String note})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => _TallySheet(target: target, sites: sites, events: events),
    );
    if (result == null) return;
    try {
      await state.workspace.recordTally(target.id, count: result.count, siteId: result.siteId, eventClusterId: result.eventId, note: result.note);
      messenger.showSnackBar(SnackBar(content: Text('${result.count} ${target.unit} recorded, awaiting review')));
      await onChanged();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }
}

class _TallySheet extends StatefulWidget {
  const _TallySheet({required this.target, required this.sites, required this.events});

  final Target target;
  final List<Site> sites;
  final List<ProjectEvent> events;

  @override
  State<_TallySheet> createState() => _TallySheetState();
}

class _TallySheetState extends State<_TallySheet> {
  final _count = TextEditingController();
  final _note = TextEditingController();
  String? _siteId;
  String? _eventId;

  @override
  void dispose() {
    _count.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = int.tryParse(_count.text) ?? 0;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Record a batch · ${widget.target.label}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 4),
        const Text('A reviewer confirms the count. Link today\'s photos so the number has evidence behind it.', style: TextStyle(color: Brand.stone, fontSize: 13)),
        const SizedBox(height: 16),
        TextField(
          controller: _count,
          keyboardType: TextInputType.number,
          autofocus: true,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: 'How many ${widget.target.unit}?'),
        ),
        const SizedBox(height: 12),
        if (widget.sites.isNotEmpty)
          DropdownButtonFormField<String?>(
            value: _siteId,
            decoration: const InputDecoration(labelText: 'Site'),
            items: [const DropdownMenuItem<String?>(value: null, child: Text('Not specified')), for (final site in widget.sites) DropdownMenuItem<String?>(value: site.id, child: Text(site.name))],
            onChanged: (value) => setState(() => _siteId = value),
          ),
        if (widget.events.isNotEmpty) ...[
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            value: _eventId,
            decoration: const InputDecoration(labelText: 'Photos of this batch'),
            items: [
              const DropdownMenuItem<String?>(value: null, child: Text('None yet')),
              for (final event in widget.events.take(20)) DropdownMenuItem<String?>(value: event.id, child: Text('${formatDayTime(event.startedAt)} · ${event.assetCount} photos')),
            ],
            onChanged: (value) => setState(() => _eventId = value),
          ),
        ],
        const SizedBox(height: 12),
        TextField(controller: _note, maxLength: 300, decoration: const InputDecoration(labelText: 'Note (optional)', hintText: 'Morning batch, canal road')),
        const SizedBox(height: 8),
        FilledButton(
          onPressed: count < 1 ? null : () => Navigator.pop(context, (count: count, siteId: _siteId, eventId: _eventId, note: _note.text)),
          child: const Text('Record'),
        ),
      ]),
    );
  }
}

class _SitesTab extends StatelessWidget {
  const _SitesTab({required this.sites, required this.onRefresh});

  final List<Site>? sites;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final items = sites;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: items == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
              children: [
                if (items.isEmpty)
                  const Padding(padding: EdgeInsets.all(24), child: Text('No sites defined. Sites are added on the web app; photos taken inside a site get an "Inside" badge.', textAlign: TextAlign.center, style: TextStyle(color: Brand.stone))),
                for (final site in items)
                  Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                    child: Row(children: [
                      const Icon(Icons.place_outlined, color: Brand.stone),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(site.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('${site.latitude.toStringAsFixed(5)}, ${site.longitude.toStringAsFixed(5)} · radius ${site.radiusM} m', style: const TextStyle(color: Brand.stone, fontSize: 12)),
                        ]),
                      ),
                    ]),
                  ),
              ],
            ),
    );
  }
}
