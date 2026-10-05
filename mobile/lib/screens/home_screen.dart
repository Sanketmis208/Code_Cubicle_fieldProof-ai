import 'package:flutter/material.dart';

import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'capture_screen.dart';
import 'submissions_screen.dart';

/// Projects this person can capture for, plus the health of the sync queue.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final membership = state.membership;
    return ListenableBuilder(
      listenable: state.queue,
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(membership?.organization.name ?? 'No organization', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            Text('${state.user?.name ?? ''} · ${membership?.roleLabel ?? ''}', style: const TextStyle(fontSize: 12, color: Brand.stone)),
          ]),
          actions: [
            IconButton(
              tooltip: 'My submissions',
              icon: Badge(
                isLabelVisible: state.queue.waiting > 0,
                label: Text('${state.queue.waiting}'),
                child: const Icon(Icons.cloud_upload_outlined),
              ),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SubmissionsScreen())),
            ),
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'signout') {
                  final confirmed = await _confirmSignOut(context, state.queue.waiting);
                  if (confirmed) await state.signOut();
                } else {
                  final next = state.memberships.firstWhere((m) => m.organization.id == value);
                  await state.switchOrganization(next);
                }
              },
              itemBuilder: (context) => [
                for (final m in state.memberships)
                  CheckedPopupMenuItem<String>(
                    value: m.organization.id,
                    checked: m.organization.id == membership?.organization.id,
                    child: Text('${m.organization.name} · ${m.roleLabel}'),
                  ),
                const PopupMenuDivider(),
                const PopupMenuItem<String>(value: 'signout', child: Text('Sign out')),
              ],
            ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: state.refresh,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _SyncCard(state: state),
              const SizedBox(height: 20),
              const Text('YOUR PROJECTS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
              const SizedBox(height: 10),
              if (state.loadingProjects && state.projects.isEmpty)
                const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
              else if (state.projectsError != null && state.projects.isEmpty)
                _Notice(icon: Icons.wifi_off, text: '${state.projectsError}. Pull down to try again.')
              else if (!state.canCapture)
                const _Notice(icon: Icons.lock_outline, text: 'Your role cannot add evidence in this organization. Ask an admin to make you a field worker.')
              else if (state.projects.isEmpty)
                const _Notice(icon: Icons.assignment_outlined, text: 'You are not assigned to an active project yet. Ask your program manager to add you.')
              else
                for (final project in state.projects) _ProjectTile(project: project),
            ],
          ),
        ),
      ),
    );
  }

  Future<bool> _confirmSignOut(BuildContext context, int waiting) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: Text(waiting > 0
            ? '$waiting capture${waiting == 1 ? ' has' : 's have'} not been sent yet and will be deleted from this phone.'
            : 'You will need your email and password to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
        ],
      ),
    );
    return result ?? false;
  }
}

class _SyncCard extends StatelessWidget {
  const _SyncCard({required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
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
  }
}

class _ProjectTile extends StatelessWidget {
  const _ProjectTile({required this.project});

  final CaptureProject project;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Text(project.name, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text([
          if (project.location != null) project.location!,
          project.sites.isEmpty ? 'No sites defined' : '${project.sites.length} site${project.sites.length == 1 ? '' : 's'}',
        ].join(' · ')),
        trailing: const CircleAvatar(backgroundColor: Brand.lime, foregroundColor: Brand.ink, child: Icon(Icons.photo_camera)),
        onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CaptureScreen(project: project))),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
      child: Row(children: [
        Icon(icon, color: Brand.stone),
        const SizedBox(width: 12),
        Expanded(child: Text(text, style: const TextStyle(color: Brand.stone))),
      ]),
    );
  }
}
