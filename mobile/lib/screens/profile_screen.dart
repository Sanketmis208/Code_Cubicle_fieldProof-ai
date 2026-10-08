import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme.dart';
import 'assistant_screen.dart';
import 'submissions_screen.dart';

/// Who you are, where you are, what this phone can do, and the way out.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final membership = state.membership;
    return Scaffold(
      appBar: AppBar(title: const Text('Me', style: TextStyle(fontWeight: FontWeight.w800))),
      body: ListenableBuilder(
        listenable: state.queue,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(24)),
              child: Row(children: [
                CircleAvatar(radius: 26, backgroundColor: Brand.lime, child: Text(_initials(state.user?.name ?? '?'), style: const TextStyle(color: Brand.ink, fontWeight: FontWeight.w900))),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(state.user?.name ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                    Text(state.user?.email ?? '', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    if (membership != null) ...[
                      const SizedBox(height: 6),
                      Text('${membership.roleLabel} · ${membership.organization.name}', style: const TextStyle(color: Brand.lime, fontSize: 12, fontWeight: FontWeight.w700)),
                    ],
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 16),
            if (state.memberships.length > 1) ...[
              const _Label('ORGANIZATION'),
              for (final m in state.memberships)
                _Row(
                  icon: m.organization.id == membership?.organization.id ? Icons.radio_button_checked : Icons.radio_button_off,
                  title: m.organization.name,
                  subtitle: m.roleLabel,
                  onTap: m.organization.id == membership?.organization.id ? null : () => state.switchOrganization(m),
                ),
              const SizedBox(height: 16),
            ],
            const _Label('WHAT YOU CAN DO HERE'),
            _Row(icon: Icons.photo_camera_outlined, title: 'Capture live evidence', subtitle: state.can('evidence.upload') ? 'Camera only, signed on this phone' : 'Not in your role', enabled: state.can('evidence.upload')),
            _Row(icon: Icons.fact_check_outlined, title: 'Review evidence and counts', subtitle: state.can('evidence.review') ? 'Approve, reject or request a re-shoot' : 'Not in your role', enabled: state.can('evidence.review')),
            _Row(icon: Icons.chat_bubble_outline, title: 'Ask FieldProof', subtitle: 'Questions answered from your organization\'s data', onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AssistantScreen()))),
            if (state.can('evidence.upload'))
              _Row(icon: Icons.cloud_upload_outlined, title: 'My submissions', subtitle: state.queue.waiting == 0 ? 'Everything sent' : '${state.queue.waiting} waiting to send', onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SubmissionsScreen()))),
            const SizedBox(height: 16),
            const _Label('THIS PHONE'),
            _Row(icon: Icons.schedule, title: state.clock.isTrusted ? 'Time synced with FieldProof' : 'Using phone clock until online', subtitle: 'Capture time never depends on the phone clock once synced'),
            _Row(icon: Icons.verified_user_outlined, title: state.device.ready ? 'Signs every capture' : 'Signing key not set up yet', subtitle: 'Ed25519 key kept in protected storage'),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () async {
                final ok = await _confirmSignOut(context, state.queue.waiting);
                if (ok) await state.signOut();
              },
              icon: const Icon(Icons.logout),
              label: const Text('Sign out'),
              style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFB91C1C), minimumSize: const Size.fromHeight(48)),
            ),
            const SizedBox(height: 8),
            const Center(child: Text('FieldProof Capture 1.0.0', style: TextStyle(color: Brand.stone, fontSize: 11))),
          ],
        ),
      ),
    );
  }

  String _initials(String name) => name.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2).map((w) => w[0]).join().toUpperCase();

  Future<bool> _confirmSignOut(BuildContext context, int waiting) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: Text(waiting > 0 ? '$waiting capture${waiting == 1 ? ' has' : 's have'} not been sent yet and will be deleted from this phone.' : 'You will need your email and password to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
        ],
      ),
    );
    return result ?? false;
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)));
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, required this.subtitle, this.onTap, this.enabled = true});

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ListTile(
        enabled: enabled,
        leading: Icon(icon, color: enabled ? Brand.ink : Brand.stone),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12)),
        trailing: onTap == null ? null : const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
