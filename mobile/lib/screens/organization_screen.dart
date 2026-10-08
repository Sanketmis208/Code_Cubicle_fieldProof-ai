import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/api_client.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';

/// The organization, as the web app shows it: members added by email (with
/// one-time setup links), roles, the audit trail and settings. Tabs appear
/// by permission: everyone who may view members sees the list; only owners
/// and admins can add, change or remove.
class OrganizationScreen extends StatefulWidget {
  const OrganizationScreen({super.key});

  @override
  State<OrganizationScreen> createState() => _OrganizationScreenState();
}

class _OrganizationScreenState extends State<OrganizationScreen> with TickerProviderStateMixin {
  TabController? _tabs;
  OrganizationDetail? _org;
  List<OrgMember>? _members;
  ({List<AuditEntry> entries, bool intact})? _audit;
  String? _error;
  String? _loadedFor;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final state = AppScope.of(context);
    final orgId = state.membership?.organization.id;
    if (orgId != _loadedFor) {
      _loadedFor = orgId;
      _org = null;
      _members = null;
      _audit = null;
      _tabs?.dispose();
      // The FAB depends on the selected tab, so the whole screen rebuilds on a change.
      _tabs = TabController(length: _tabCount(state), vsync: this)..addListener(() => setState(() {}));
      _load();
    }
  }

  int _tabCount(AppState state) => 1 + (state.can('org.members.view') ? 1 : 0) + (state.can('audit.view') ? 1 : 0);

  @override
  void dispose() {
    _tabs?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final state = AppScope.of(context);
    final orgId = state.membership?.organization.id;
    if (orgId == null) return;
    try {
      final results = await Future.wait<Object?>([
        state.workspace.organization(orgId),
        if (state.can('org.members.view')) state.workspace.members(orgId) else Future.value(null),
        if (state.can('audit.view')) state.workspace.audit(orgId) else Future.value(null),
      ]);
      if (!mounted) return;
      setState(() {
        _org = results[0] as OrganizationDetail;
        _members = results[1] as List<OrgMember>?;
        _audit = results[2] as ({List<AuditEntry> entries, bool intact})?;
        _error = null;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final tabs = _tabs;
    if (tabs == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return Scaffold(
      appBar: AppBar(
        title: Text(state.membership?.organization.name ?? 'Organization', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        bottom: TabBar(
          controller: tabs,
          labelColor: Brand.ink,
          indicatorColor: Brand.ink,
          tabs: [
            const Tab(text: 'Overview'),
            if (state.can('org.members.view')) Tab(text: 'Members${_members == null ? '' : ' (${_members!.length})'}'),
            if (state.can('audit.view')) const Tab(text: 'Audit'),
          ],
        ),
      ),
      floatingActionButton: state.can('org.members.manage') && tabs.index == 1
          ? FloatingActionButton.extended(
              backgroundColor: Brand.lime,
              foregroundColor: Brand.ink,
              icon: const Icon(Icons.person_add_alt_1),
              label: const Text('Add member'),
              onPressed: () => _addMember(context),
            )
          : null,
      body: _error != null && _org == null
          ? Center(child: Padding(padding: const EdgeInsets.all(32), child: Text('$_error', style: const TextStyle(color: Brand.stone))))
          : AnimatedBuilder(
              animation: tabs,
              builder: (context, _) => TabBarView(controller: tabs, children: [
                _OverviewTab(org: _org, onRefresh: _load, onRenamed: () async {
                  await state.reloadSession();
                  await _load();
                }),
                if (state.can('org.members.view')) _MembersTab(members: _members, onRefresh: _load),
                if (state.can('audit.view')) _AuditTab(audit: _audit, onRefresh: _load),
              ]),
            ),
    );
  }

  Future<void> _addMember(BuildContext context) async {
    final state = AppScope.of(context);
    final orgId = state.membership!.organization.id;
    final actorRole = state.membership!.role;
    final input = await showModalBottomSheet<({String name, String email, String role})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => _AddMemberSheet(actorRole: actorRole),
    );
    if (input == null || !context.mounted) return;
    try {
      final result = await state.workspace.addMember(orgId, name: input.name, email: input.email, role: input.role);
      await _load();
      if (!context.mounted) return;
      await showSetupResult(context, name: result.member.name, email: result.member.email, emailSent: result.emailSent, setupLink: result.setupLink, newAccount: result.newAccount);
    } on ApiException catch (error) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }
}

/// Tells the admin what happened: the link went by email, or (SMTP not set
/// up) the one-time link is shown here to copy and send by hand.
Future<void> showSetupResult(BuildContext context, {required String name, required String email, required bool emailSent, String? setupLink, bool newAccount = true}) {
  return showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(emailSent ? 'Setup link sent' : 'Setup link ready'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          !newAccount
              ? '$name already had a FieldProof account and has been added. They sign in with their existing password.'
              : emailSent
                  ? '$name will receive an email at $email with a link to choose a password. The link works for 7 days.'
                  : 'Email is not configured on the server, so send this one-time link to $name ($email) yourself. It works for 7 days.',
          style: const TextStyle(height: 1.4),
        ),
        if (setupLink != null) ...[
          const SizedBox(height: 12),
          SelectableText(setupLink, style: const TextStyle(fontSize: 12, fontFamily: 'monospace')),
        ],
      ]),
      actions: [
        if (setupLink != null)
          TextButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: setupLink));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Link copied')));
                Navigator.pop(context);
              }
            },
            icon: const Icon(Icons.copy, size: 16),
            label: const Text('Copy link'),
          ),
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
      ],
    ),
  );
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({required this.org, required this.onRefresh, required this.onRenamed});

  final OrganizationDetail? org;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onRenamed;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final detail = org;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: detail == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(24)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(detail.name, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 4),
                    Text('${orgTypeLabels[detail.type] ?? detail.type} · you are ${roleLabels[detail.role]?.toLowerCase() ?? detail.role}', style: const TextStyle(color: Brand.lime, fontSize: 13, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 16),
                    Row(children: [
                      _Big(value: detail.members, label: 'members'),
                      const SizedBox(width: 28),
                      _Big(value: detail.projects, label: 'projects'),
                    ]),
                  ]),
                ),
                const SizedBox(height: 16),
                const _Label('HOW ACCESS WORKS'),
                const _Card(children: [
                  _Bullet('Members are added by email. The backend creates the account and sends a one-time setup link; there are no invite codes.'),
                  _Bullet('Owners and admins see every project. Program managers, verifiers and field workers see only the projects they are assigned to.'),
                  _Bullet('Nobody reviews their own upload or confirms their own count. Every decision is in the audit trail.'),
                ]),
                const SizedBox(height: 16),
                const _Label('ROLES'),
                _Card(children: [
                  for (final role in ['OWNER', ...assignableRoles])
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        SizedBox(width: 130, child: Text(roleLabels[role] ?? role, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13))),
                        Expanded(child: Text(role == 'OWNER' ? 'Everything, including settings; the last owner cannot be removed' : roleHints[role] ?? '', style: const TextStyle(color: Brand.stone, fontSize: 13))),
                      ]),
                    ),
                ]),
                if (state.can('org.settings')) ...[
                  const SizedBox(height: 16),
                  const _Label('SETTINGS'),
                  _Card(children: [
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.edit_outlined),
                      title: const Text('Rename or change type', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => _edit(context, detail),
                    ),
                  ]),
                ],
              ],
            ),
    );
  }

  Future<void> _edit(BuildContext context, OrganizationDetail detail) async {
    final state = AppScope.of(context);
    final input = await showModalBottomSheet<({String name, String type})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => OrganizationFormSheet(name: detail.name, type: detail.type),
    );
    if (input == null || !context.mounted) return;
    try {
      await state.workspace.updateOrganization(detail.id, name: input.name, type: input.type);
      await onRenamed();
    } on ApiException catch (error) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }
}

/// Name and type, for creating an organization or changing its settings.
class OrganizationFormSheet extends StatefulWidget {
  const OrganizationFormSheet({super.key, this.name, this.type});

  final String? name;
  final String? type;

  @override
  State<OrganizationFormSheet> createState() => _OrganizationFormSheetState();
}

class _OrganizationFormSheetState extends State<OrganizationFormSheet> {
  late final _name = TextEditingController(text: widget.name ?? '');
  late String _type = widget.type ?? 'NGO';

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final creating = widget.name == null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(creating ? 'New organization' : 'Organization settings', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 4),
        Text(creating ? 'You become its owner. Add your team by email afterwards.' : 'Every member sees the new name on their next refresh.', style: const TextStyle(color: Brand.stone, fontSize: 13)),
        const SizedBox(height: 16),
        TextField(controller: _name, autofocus: creating, maxLength: 120, textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Name', hintText: 'Green Roots Foundation')),
        const SizedBox(height: 4),
        DropdownButtonFormField<String>(
          value: _type,
          decoration: const InputDecoration(labelText: 'Type'),
          items: [for (final entry in orgTypeLabels.entries) DropdownMenuItem(value: entry.key, child: Text(entry.value))],
          onChanged: (value) => setState(() => _type = value ?? _type),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _name.text.trim().length < 2 ? null : () => Navigator.pop(context, (name: _name.text, type: _type)),
          child: Text(creating ? 'Create organization' : 'Save'),
        ),
      ]),
    );
  }
}

class _MembersTab extends StatelessWidget {
  const _MembersTab({required this.members, required this.onRefresh});

  final List<OrgMember>? members;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final items = members;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: items == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                if (state.can('org.members.manage'))
                  const Padding(padding: EdgeInsets.only(bottom: 12), child: Text('Add a member with their name and email. They choose a password through the link they receive; people awaiting setup are marked below.', style: TextStyle(color: Brand.stone, fontSize: 13))),
                for (final member in items) _MemberCard(member: member, onChanged: onRefresh),
              ],
            ),
    );
  }
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({required this.member, required this.onChanged});

  final OrgMember member;
  final Future<void> Function() onChanged;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final self = member.userId == state.user?.id;
    final manageable = state.can('org.members.manage') && !self && _canManage(state.membership!.role, member.role);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Row(children: [
        CircleAvatar(radius: 22, backgroundColor: member.pendingSetup ? const Color(0xFFFEF3C7) : Brand.lime, child: Text(_initials(member.name), style: const TextStyle(color: Brand.ink, fontWeight: FontWeight.w900))),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(child: Text(member.name + (self ? ' (you)' : ''), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15), overflow: TextOverflow.ellipsis)),
              if (member.pendingSetup) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(99)),
                  child: const Text('Awaiting setup', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Color(0xFF92400E))),
                ),
              ],
            ]),
            Text(member.email, style: const TextStyle(color: Brand.stone, fontSize: 12)),
            const SizedBox(height: 4),
            Text('${member.roleLabel}${member.assignedProjects > 0 ? ' · ${member.assignedProjects} project${member.assignedProjects == 1 ? '' : 's'}' : ''}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ]),
        ),
        if (manageable)
          PopupMenuButton<String>(
            onSelected: (action) => _act(context, action),
            itemBuilder: (context) => [
              const PopupMenuItem(value: 'role', child: Text('Change role')),
              if (member.pendingSetup) const PopupMenuItem(value: 'resend', child: Text('Resend setup link')),
              const PopupMenuItem(value: 'remove', child: Text('Remove from organization', style: TextStyle(color: Color(0xFFB91C1C)))),
            ],
          ),
      ]),
    );
  }

  static bool _canManage(String actorRole, String targetRole) {
    if (actorRole == 'OWNER') return true;
    if (actorRole != 'ADMIN') return false;
    return targetRole != 'OWNER' && targetRole != 'ADMIN';
  }

  String _initials(String name) => name.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2).map((w) => w[0]).join().toUpperCase();

  Future<void> _act(BuildContext context, String action) async {
    final state = AppScope.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final orgId = state.membership!.organization.id;
    try {
      switch (action) {
        case 'role':
          final role = await _pickRole(context, state.membership!.role);
          if (role == null || role == member.role) return;
          await state.workspace.changeRole(orgId, member.userId, role);
          messenger.showSnackBar(SnackBar(content: Text('${member.name} is now ${roleLabels[role]?.toLowerCase() ?? role}')));
        case 'resend':
          final result = await state.workspace.resendSetup(orgId, member.userId);
          if (!context.mounted) return;
          await showSetupResult(context, name: member.name, email: member.email, emailSent: result.emailSent, setupLink: result.setupLink);
        case 'remove':
          final ok = await _confirm(context, 'Remove ${member.name}?', 'They lose access to this organization and its projects. Their evidence stays.');
          if (!ok) return;
          await state.workspace.removeMember(orgId, member.userId);
          messenger.showSnackBar(SnackBar(content: Text('${member.name} removed')));
      }
      await onChanged();
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<String?> _pickRole(BuildContext context, String actorRole) {
    final options = actorRole == 'OWNER' ? ['OWNER', ...assignableRoles] : assignableRoles.where((r) => r != 'ADMIN').toList();
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => SafeArea(
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(12), children: [
          Padding(padding: const EdgeInsets.all(8), child: Text('Role for ${member.name}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
          for (final role in options)
            ListTile(
              leading: Icon(role == member.role ? Icons.radio_button_checked : Icons.radio_button_off),
              title: Text(roleLabels[role] ?? role, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(role == 'OWNER' ? 'Full control; ownership can be shared' : roleHints[role] ?? ''),
              onTap: () => Navigator.pop(context, role),
            ),
        ]),
      ),
    );
  }

  Future<bool> _confirm(BuildContext context, String title, String body) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), style: TextButton.styleFrom(foregroundColor: const Color(0xFFB91C1C)), child: const Text('Remove')),
        ],
      ),
    );
    return result ?? false;
  }
}

class _AddMemberSheet extends StatefulWidget {
  const _AddMemberSheet({required this.actorRole});

  final String actorRole;

  @override
  State<_AddMemberSheet> createState() => _AddMemberSheetState();
}

class _AddMemberSheetState extends State<_AddMemberSheet> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  String _role = 'FIELD_WORKER';

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  bool get _valid => _name.text.trim().length >= 2 && RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim());

  @override
  Widget build(BuildContext context) {
    final roles = widget.actorRole == 'OWNER' ? assignableRoles : assignableRoles.where((r) => r != 'ADMIN').toList();
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Add a member', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 4),
        const Text('They receive a one-time link by email to choose a password. No invite code.', style: TextStyle(color: Brand.stone, fontSize: 13)),
        const SizedBox(height: 16),
        TextField(controller: _name, autofocus: true, textCapitalization: TextCapitalization.words, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Full name')),
        const SizedBox(height: 12),
        TextField(controller: _email, keyboardType: TextInputType.emailAddress, autocorrect: false, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: _role,
          decoration: const InputDecoration(labelText: 'Role'),
          items: [for (final role in roles) DropdownMenuItem(value: role, child: Text(roleLabels[role] ?? role))],
          onChanged: (value) => setState(() => _role = value ?? _role),
        ),
        const SizedBox(height: 6),
        Text(roleHints[_role] ?? '', style: const TextStyle(color: Brand.stone, fontSize: 12)),
        const SizedBox(height: 16),
        FilledButton(onPressed: _valid ? () => Navigator.pop(context, (name: _name.text, email: _email.text, role: _role)) : null, child: const Text('Add and send setup link')),
      ]),
    );
  }
}

class _AuditTab extends StatelessWidget {
  const _AuditTab({required this.audit, required this.onRefresh});

  final ({List<AuditEntry> entries, bool intact})? audit;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final data = audit;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: data == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: data.intact ? const Color(0xFFD1FAE5) : const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(16)),
                  child: Row(children: [
                    Icon(data.intact ? Icons.verified_outlined : Icons.error_outline, color: data.intact ? const Color(0xFF065F46) : const Color(0xFFB91C1C)),
                    const SizedBox(width: 10),
                    Expanded(child: Text(data.intact ? 'Hash chain intact: ${data.entries.length} entries, none altered.' : 'Hash chain broken: an entry was altered after it was written.', style: TextStyle(color: data.intact ? const Color(0xFF065F46) : const Color(0xFFB91C1C), fontWeight: FontWeight.w700, fontSize: 13))),
                  ]),
                ),
                const SizedBox(height: 12),
                if (data.entries.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Nothing recorded yet.', style: TextStyle(color: Brand.stone)))),
                for (final entry in data.entries)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(entry.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                      const SizedBox(height: 2),
                      Text('${entry.actorName ?? 'System'} · ${formatDayTime(entry.at)}${_detail(entry)}', style: const TextStyle(color: Brand.stone, fontSize: 12)),
                    ]),
                  ),
              ],
            ),
    );
  }

  String _detail(AuditEntry entry) {
    final meta = entry.metadata;
    if (meta == null) return '';
    final parts = <String>[];
    if (meta['name'] is String) parts.add(meta['name'] as String);
    if (meta['title'] is String) parts.add(meta['title'] as String);
    if (meta['role'] is String) parts.add(roleLabels[meta['role']] ?? meta['role'] as String);
    if (meta['from'] is String && meta['to'] is String) parts.add('${roleLabels[meta['from']] ?? meta['from']} → ${roleLabels[meta['to']] ?? meta['to']}');
    if (meta['decision'] is String) parts.add(reviewLabels[meta['decision']] ?? meta['decision'] as String);
    if (meta['count'] is num) parts.add('${meta['count']}');
    return parts.isEmpty ? '' : ' · ${parts.join(' · ')}';
  }
}

class _Big extends StatelessWidget {
  const _Big({required this.value, required this.label});

  final int value;
  final String label;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$value', style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
      ]);
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)));
}

class _Card extends StatelessWidget {
  const _Card({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );
}

class _Bullet extends StatelessWidget {
  const _Bullet(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(padding: EdgeInsets.only(top: 6), child: Icon(Icons.circle, size: 6, color: Brand.stone)),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13, height: 1.4))),
        ]),
      );
}
