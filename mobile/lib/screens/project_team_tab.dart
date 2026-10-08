import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';

/// Who works on a project: assigned members (field workers, verifiers,
/// program managers) and the org-wide roles who see it anyway. Assigning
/// needs `project.members.manage`.
class ProjectTeamTab extends StatefulWidget {
  const ProjectTeamTab({super.key, required this.projectId});

  final String projectId;

  @override
  State<ProjectTeamTab> createState() => _ProjectTeamTabState();
}

class _ProjectTeamTabState extends State<ProjectTeamTab> with AutomaticKeepAliveClientMixin {
  ProjectTeam? _team;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    try {
      final team = await AppScope.of(context).workspace.team(widget.projectId);
      if (mounted) setState(() { _team = team; _error = null; });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _assign() async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final orgId = state.membership!.organization.id;
    List<OrgMember> members;
    try {
      members = await state.workspace.members(orgId);
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
      return;
    }
    final already = {..._team?.assigned.map((m) => m.userId) ?? const <String>[], ..._team?.orgWide.map((m) => m.userId) ?? const <String>[]};
    final candidates = members.where((m) => !already.contains(m.userId) && m.status == 'ACTIVE').toList();
    if (!mounted) return;
    final picked = await showModalBottomSheet<OrgMember>(
      context: context,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => SafeArea(
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(12), children: [
          const Padding(padding: EdgeInsets.all(8), child: Text('Assign to this project', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
          if (candidates.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('Everyone in the organization is already on this project. Add new members from the Organization tab.', style: TextStyle(color: Brand.stone))),
          for (final member in candidates)
            ListTile(
              leading: CircleAvatar(backgroundColor: Brand.lime, child: Text(member.name.isEmpty ? '?' : member.name[0].toUpperCase(), style: const TextStyle(color: Brand.ink, fontWeight: FontWeight.w900))),
              title: Text(member.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${member.roleLabel}${member.pendingSetup ? ' · awaiting setup' : ''}'),
              onTap: () => Navigator.pop(context, member),
            ),
        ]),
      ),
    );
    if (picked == null) return;
    try {
      await state.workspace.assign(widget.projectId, picked.userId);
      messenger.showSnackBar(SnackBar(content: Text('${picked.name} assigned')));
      await _load();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _unassign(TeamMember member) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await state.workspace.unassign(widget.projectId, member.userId);
      messenger.showSnackBar(SnackBar(content: Text('${member.name} removed from the project')));
      await _load();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = AppScope.of(context);
    final team = _team;
    final canManage = state.can('project.members.manage');
    return RefreshIndicator(
      onRefresh: _load,
      child: team == null
          ? ListView(children: [Padding(padding: const EdgeInsets.all(40), child: Center(child: _error == null ? const CircularProgressIndicator() : Text('$_error', style: const TextStyle(color: Brand.stone))))])
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
              children: [
                Row(children: [
                  Expanded(child: Text('ASSIGNED (${team.assigned.length})', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone))),
                  if (canManage) TextButton.icon(onPressed: _assign, icon: const Icon(Icons.person_add_alt_1, size: 18), label: const Text('Assign')),
                ]),
                if (team.assigned.isEmpty)
                  const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Nobody assigned yet. Field workers and verifiers only see projects they are assigned to.', style: TextStyle(color: Brand.stone, fontSize: 13))),
                for (final member in team.assigned)
                  _PersonRow(member: member, trailing: canManage ? IconButton(tooltip: 'Remove from project', icon: const Icon(Icons.person_remove_outlined), onPressed: () => _unassign(member)) : null),
                const SizedBox(height: 16),
                Text('SEE EVERY PROJECT (${team.orgWide.length})', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
                const SizedBox(height: 6),
                for (final member in team.orgWide) _PersonRow(member: member),
              ],
            ),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.member, this.trailing});

  final TeamMember member;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        CircleAvatar(radius: 18, backgroundColor: Brand.paper, child: Text(member.name.isEmpty ? '?' : member.name[0].toUpperCase(), style: const TextStyle(color: Brand.ink, fontWeight: FontWeight.w900))),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(member.name, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text([member.roleLabel, if (member.email != null) member.email!].join(' · '), style: const TextStyle(color: Brand.stone, fontSize: 12)),
          ]),
        ),
        if (trailing != null) trailing!,
      ]),
    );
  }
}
