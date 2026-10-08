import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/geo.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../services/location_service.dart';
import '../widgets/evidence_tile.dart';
import 'capture_screen.dart';
import 'claims_screen.dart';
import 'evidence_detail_screen.dart';
import 'project_form_sheet.dart';
import 'project_team_tab.dart';
import 'reports_screen.dart';

/// One project: its evidence, its targets ("how many?"), its sites and its
/// team, with the same editing the web app offers to the same roles.
class ProjectDetailScreen extends StatefulWidget {
  const ProjectDetailScreen({super.key, required this.project});

  final ProjectSummary project;

  @override
  State<ProjectDetailScreen> createState() => _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends State<ProjectDetailScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this);
  late ProjectSummary _project = widget.project;
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

  CaptureProject get _captureProject => CaptureProject(id: _project.id, name: _project.name, location: _project.location, sites: _sites ?? const []);

  Future<void> _menu(String action) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    switch (action) {
      case 'edit':
        final fields = await showModalBottomSheet<Map<String, Object?>>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Brand.paper,
          shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
          builder: (context) => ProjectFormSheet(project: _project),
        );
        if (fields == null) return;
        try {
          final updated = await state.workspace.updateProject(_project.id, fields);
          if (mounted) setState(() => _project = updated);
          messenger.showSnackBar(const SnackBar(content: Text('Project updated')));
        } on ApiException catch (error) {
          messenger.showSnackBar(SnackBar(content: Text(error.message)));
        }
      case 'reports':
        if (mounted) Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ReportsScreen(project: _project)));
      case 'claims':
        if (mounted) Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ClaimsScreen(projectId: _project.id, projectName: _project.name)));
      case 'delete':
        final ok = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text('Delete ${_project.name}?'),
            content: Text('All ${_project.assetCount} evidence files, targets, sites and reports in it are deleted. This cannot be undone.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
              TextButton(onPressed: () => Navigator.pop(context, true), style: TextButton.styleFrom(foregroundColor: const Color(0xFFB91C1C)), child: const Text('Delete project')),
            ],
          ),
        );
        if (ok != true) return;
        try {
          await state.workspace.deleteProject(_project.id);
          await state.refreshProjects();
          if (mounted) Navigator.pop(context, true);
        } on ApiException catch (error) {
          messenger.showSnackBar(SnackBar(content: Text(error.message)));
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(_project.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        actions: [
          PopupMenuButton<String>(
            onSelected: _menu,
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'reports', child: ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.description_outlined), title: Text('Reports'))),
              const PopupMenuItem(value: 'claims', child: ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.fact_check_outlined), title: Text('Check a claim'))),
              if (state.can('project.edit')) const PopupMenuItem(value: 'edit', child: ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.edit_outlined), title: Text('Edit project'))),
              if (state.can('project.delete')) const PopupMenuItem(value: 'delete', child: ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.delete_outline, color: Color(0xFFB91C1C)), title: Text('Delete project', style: TextStyle(color: Color(0xFFB91C1C))))),
            ],
          ),
        ],
        bottom: TabBar(
          controller: _tabs,
          labelColor: Brand.ink,
          indicatorColor: Brand.ink,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            Tab(text: 'Evidence${_evidence == null ? '' : ' (${_evidence!.length})'}'),
            Tab(text: 'Targets${_targets == null ? '' : ' (${_targets!.length})'}'),
            Tab(text: 'Sites${_sites == null ? '' : ' (${_sites!.length})'}'),
            const Tab(text: 'Team'),
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
              _TargetsTab(project: _project, targets: _targets, sites: _sites ?? const [], onRefresh: _load),
              _SitesTab(project: _project, sites: _sites, onRefresh: _load),
              ProjectTeamTab(projectId: _project.id),
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
    final canEdit = state.can('project.edit');
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: items == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
              children: [
                if (canEdit)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: OutlinedButton.icon(onPressed: () => _newTarget(context), icon: const Icon(Icons.flag_outlined), label: const Text('Set a target')),
                  ),
                if (items.isEmpty)
                  Padding(padding: const EdgeInsets.all(24), child: Text(canEdit ? 'No targets yet. Set one such as "500 saplings"; field workers record batches against it and a reviewer confirms them.' : 'No targets set. An admin or program manager sets targets such as "500 saplings"; batches are recorded here.', textAlign: TextAlign.center, style: const TextStyle(color: Brand.stone))),
                for (final target in items) _TargetCard(project: project, target: target, sites: sites, canRecord: state.can('evidence.upload'), canReview: state.can('evidence.review'), canDelete: canEdit, onChanged: onRefresh),
              ],
            ),
    );
  }

  Future<void> _newTarget(BuildContext context) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final input = await showModalBottomSheet<({String label, String unit, int count, DateTime? due})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => const _TargetSheet(),
    );
    if (input == null) return;
    try {
      await state.workspace.createTarget(project.id, label: input.label, unit: input.unit, targetCount: input.count, dueDate: input.due);
      messenger.showSnackBar(SnackBar(content: Text('Target set: ${input.count} ${input.unit}')));
      await onRefresh();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }
}

class _TargetSheet extends StatefulWidget {
  const _TargetSheet();

  @override
  State<_TargetSheet> createState() => _TargetSheetState();
}

class _TargetSheetState extends State<_TargetSheet> {
  final _label = TextEditingController();
  final _unit = TextEditingController(text: 'saplings');
  final _count = TextEditingController();
  DateTime? _due;

  @override
  void dispose() {
    _label.dispose();
    _unit.dispose();
    _count.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final count = int.tryParse(_count.text) ?? 0;
    final valid = _label.text.trim().length >= 2 && _unit.text.trim().isNotEmpty && count >= 1;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Set a target', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 4),
        const Text('What the project promises, in numbers. Progress counts only batches a reviewer confirmed.', style: TextStyle(color: Brand.stone, fontSize: 13)),
        const SizedBox(height: 16),
        TextField(controller: _label, autofocus: true, maxLength: 120, textCapitalization: TextCapitalization.sentences, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'What', hintText: 'Saplings planted in Plot B')),
        Row(children: [
          Expanded(child: TextField(controller: _count, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'How many', hintText: '500'))),
          const SizedBox(width: 10),
          Expanded(child: TextField(controller: _unit, maxLength: 40, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Unit', hintText: 'saplings', counterText: ''))),
        ]),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final picked = await showDatePicker(context: context, initialDate: _due ?? DateTime.now().add(const Duration(days: 30)), firstDate: DateTime.now().subtract(const Duration(days: 365)), lastDate: DateTime(2040));
            if (picked != null) setState(() => _due = picked);
          },
          icon: const Icon(Icons.event_outlined),
          label: Text(_due == null ? 'Due date (optional)' : 'Due ${formatDay(_due!)}'),
        ),
        const SizedBox(height: 12),
        FilledButton(onPressed: valid ? () => Navigator.pop(context, (label: _label.text, unit: _unit.text, count: count, due: _due)) : null, child: const Text('Set target')),
      ]),
    );
  }
}

class _TargetCard extends StatelessWidget {
  const _TargetCard({required this.project, required this.target, required this.sites, required this.canRecord, required this.canReview, required this.canDelete, required this.onChanged});

  final ProjectSummary project;
  final Target target;
  final List<Site> sites;
  final bool canRecord;
  final bool canReview;
  final bool canDelete;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(target.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
          if (canDelete) IconButton(visualDensity: VisualDensity.compact, tooltip: 'Remove target', icon: const Icon(Icons.delete_outline, size: 20, color: Brand.stone), onPressed: () => _delete(context)),
        ]),
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

  Future<void> _delete(BuildContext context) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove "${target.label}"?'),
        content: Text('Its ${target.batches} recorded batch${target.batches == 1 ? '' : 'es'} go with it.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), style: TextButton.styleFrom(foregroundColor: const Color(0xFFB91C1C)), child: const Text('Remove')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await state.workspace.deleteTarget(project.id, target.id);
      await onChanged();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
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
  const _SitesTab({required this.project, required this.sites, required this.onRefresh});

  final ProjectSummary project;
  final List<Site>? sites;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final items = sites;
    final canEdit = state.can('project.edit');
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: items == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
              children: [
                if (canEdit)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: OutlinedButton.icon(onPressed: () => _addSite(context), icon: const Icon(Icons.add_location_alt_outlined), label: const Text('Add a site')),
                  ),
                if (items.isEmpty)
                  Padding(padding: const EdgeInsets.all(24), child: Text(canEdit ? 'No sites yet. Stand at the plot and add one with your current location; photos taken inside it get an "Inside" badge and score higher.' : 'No sites defined. Sites are added by a program manager or admin; photos taken inside a site get an "Inside" badge.', textAlign: TextAlign.center, style: const TextStyle(color: Brand.stone))),
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
                      if (canEdit) IconButton(tooltip: 'Remove site', icon: const Icon(Icons.delete_outline, size: 20, color: Brand.stone), onPressed: () => _deleteSite(context, site)),
                    ]),
                  ),
              ],
            ),
    );
  }

  Future<void> _addSite(BuildContext context) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final input = await showModalBottomSheet<({String name, double lat, double lng, int radius})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => const _SiteSheet(),
    );
    if (input == null) return;
    try {
      await state.workspace.createSite(project.id, name: input.name, latitude: input.lat, longitude: input.lng, radiusM: input.radius);
      messenger.showSnackBar(SnackBar(content: Text('Site "${input.name}" added')));
      await onRefresh();
      await state.refreshProjects();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _deleteSite(BuildContext context, Site site) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Remove ${site.name}?'),
        content: const Text('Evidence already matched to this site keeps its record; new photos will not get its "Inside" badge.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), style: TextButton.styleFrom(foregroundColor: const Color(0xFFB91C1C)), child: const Text('Remove')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await state.workspace.deleteSite(project.id, site.id);
      await onRefresh();
      await state.refreshProjects();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }
}

/// Name, centre and radius; "Use my location" reads the phone's GPS once.
class _SiteSheet extends StatefulWidget {
  const _SiteSheet();

  @override
  State<_SiteSheet> createState() => _SiteSheetState();
}

class _SiteSheetState extends State<_SiteSheet> {
  final _name = TextEditingController();
  final _lat = TextEditingController();
  final _lng = TextEditingController();
  double _radius = 500;
  bool _locating = false;
  String? _locationNote;

  @override
  void dispose() {
    _name.dispose();
    _lat.dispose();
    _lng.dispose();
    super.dispose();
  }

  Future<void> _useMyLocation() async {
    setState(() { _locating = true; _locationNote = null; });
    try {
      final fix = await LocationService.currentFix();
      if (!mounted) return;
      if (fix == null) {
        setState(() => _locationNote = 'Location is off or not allowed for this app.');
      } else {
        _lat.text = fix.latitude.toStringAsFixed(6);
        _lng.text = fix.longitude.toStringAsFixed(6);
        setState(() => _locationNote = 'Accuracy about ${fix.accuracyM.round()} m${fix.mocked ? ' · mock location detected' : ''}');
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lat = double.tryParse(_lat.text);
    final lng = double.tryParse(_lng.text);
    final valid = _name.text.trim().length >= 2 && lat != null && lng != null && lat.abs() <= 90 && lng.abs() <= 180;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Add a site', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          const SizedBox(height: 4),
          const Text('A centre and a radius. Photos captured inside it are matched to the site automatically.', style: TextStyle(color: Brand.stone, fontSize: 13)),
          const SizedBox(height: 16),
          TextField(controller: _name, autofocus: true, maxLength: 120, textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Name', hintText: 'Plot B, canal road')),
          OutlinedButton.icon(
            onPressed: _locating ? null : _useMyLocation,
            icon: _locating ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.my_location),
            label: Text(_locating ? 'Finding you…' : 'Use my current location'),
          ),
          if (_locationNote != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_locationNote!, style: const TextStyle(color: Brand.stone, fontSize: 12))),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: TextField(controller: _lat, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Latitude'))),
            const SizedBox(width: 10),
            Expanded(child: TextField(controller: _lng, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Longitude'))),
          ]),
          const SizedBox(height: 12),
          Text('Radius: ${_radius.round()} m', style: const TextStyle(fontWeight: FontWeight.w700)),
          Slider(value: _radius, min: 25, max: 5000, divisions: 199, label: '${_radius.round()} m', activeColor: Brand.ink, onChanged: (value) => setState(() => _radius = value)),
          FilledButton(onPressed: valid ? () => Navigator.pop(context, (name: _name.text, lat: lat, lng: lng, radius: _radius.round())) : null, child: const Text('Add site')),
        ]),
      ),
    );
  }
}
