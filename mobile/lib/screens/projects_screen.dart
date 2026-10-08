import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'claims_screen.dart';
import 'project_detail_screen.dart';
import 'project_form_sheet.dart';
import 'reports_screen.dart';

/// Every project this person can see (all of them for owners, admins and
/// viewers; assigned ones for everyone else).
class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  List<ProjectSummary>? _projects;
  String? _error;
  String? _loadedFor;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final orgId = AppScope.of(context).membership?.organization.id;
    if (orgId != _loadedFor) {
      _loadedFor = orgId;
      _projects = null;
      _load();
    }
  }

  Future<void> _load() async {
    try {
      final projects = await AppScope.of(context).workspace.projects();
      if (mounted) setState(() { _projects = projects; _error = null; });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _create() async {
    final state = AppScope.of(context);
    final fields = await showModalBottomSheet<Map<String, Object?>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => const ProjectFormSheet(),
    );
    if (fields == null || !mounted) return;
    try {
      final project = await state.workspace.createProject(fields);
      await _load();
      await state.refreshProjects();
      if (mounted) Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ProjectDetailScreen(project: project)));
    } on ApiException catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final projects = _projects;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Projects', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(tooltip: 'Reports', icon: const Icon(Icons.description_outlined), onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ReportsScreen()))),
          IconButton(tooltip: 'Check a claim', icon: const Icon(Icons.fact_check_outlined), onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ClaimsScreen()))),
        ],
      ),
      floatingActionButton: state.can('project.create')
          ? FloatingActionButton.extended(backgroundColor: Brand.lime, foregroundColor: Brand.ink, onPressed: _create, icon: const Icon(Icons.add), label: const Text('New project'))
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: projects == null
            ? ListView(children: [
                Padding(
                  padding: const EdgeInsets.all(40),
                  child: Center(child: _error == null ? const CircularProgressIndicator() : Text('$_error. Pull down to try again.', style: const TextStyle(color: Brand.stone))),
                ),
              ])
            : projects.isEmpty
                ? ListView(children: [Padding(padding: const EdgeInsets.all(40), child: Center(child: Text(state.can('project.create') ? 'No projects yet. Create the first one.' : 'No projects yet. A program manager or admin can assign you to one.', textAlign: TextAlign.center, style: const TextStyle(color: Brand.stone))))])
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                    itemCount: projects.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final project = projects[index];
                      return InkWell(
                        borderRadius: BorderRadius.circular(20),
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ProjectDetailScreen(project: project)));
                          _load();
                        },
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(child: Text(project.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                              _StatusPill(status: project.status),
                            ]),
                            if (project.location != null || project.category != null) ...[
                              const SizedBox(height: 4),
                              Text([project.category, project.location].whereType<String>().join(' · '), style: const TextStyle(color: Brand.stone, fontSize: 13)),
                            ],
                            const SizedBox(height: 10),
                            Row(children: [
                              _Count(icon: Icons.photo_library_outlined, text: '${project.assetCount} evidence'),
                              const SizedBox(width: 14),
                              _Count(icon: Icons.compare_outlined, text: '${project.comparisonCount}'),
                              const SizedBox(width: 14),
                              _Count(icon: Icons.description_outlined, text: '${project.reportCount}'),
                            ]),
                          ]),
                        ),
                      );
                    },
                  ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (status) {
      'ACTIVE' => (const Color(0xFFD1FAE5), const Color(0xFF065F46)),
      'COMPLETED' => (const Color(0xFFDBEAFE), const Color(0xFF1E3A8A)),
      'ARCHIVED' => (const Color(0xFFF1F5F9), const Color(0xFF475569)),
      _ => (const Color(0xFFFEF3C7), const Color(0xFF92400E)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Text(status[0] + status.substring(1).toLowerCase(), style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }
}

class _Count extends StatelessWidget {
  const _Count({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 15, color: Brand.stone),
      const SizedBox(width: 4),
      Text(text, style: const TextStyle(color: Brand.stone, fontSize: 12)),
    ]);
  }
}
