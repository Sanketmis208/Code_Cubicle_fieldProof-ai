import 'package:flutter/material.dart';

import '../core/models.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'capture_screen.dart';

/// Capture tab: pick the project, then the camera opens. Evidence can only
/// enter the app through that camera.
class CapturePickerScreen extends StatelessWidget {
  const CapturePickerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Capture', style: TextStyle(fontWeight: FontWeight.w800))),
      body: RefreshIndicator(
        onRefresh: state.refresh,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(24)),
              child: const Row(children: [
                Icon(Icons.verified_user, color: Brand.lime),
                SizedBox(width: 12),
                Expanded(child: Text('Photos are taken live, signed on this phone and stamped with place and FieldProof time. No gallery, no forwards.', style: TextStyle(color: Colors.white))),
              ]),
            ),
            const SizedBox(height: 20),
            const Text('CHOOSE A PROJECT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 2, color: Brand.stone)),
            const SizedBox(height: 10),
            if (state.loadingProjects && state.projects.isEmpty)
              const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
            else if (state.projectsError != null && state.projects.isEmpty)
              _Notice(text: '${state.projectsError}. Pull down to try again.')
            else if (state.projects.isEmpty)
              const _Notice(text: 'You are not assigned to an active project yet. Ask your program manager to add you.')
            else
              for (final project in state.projects) _ProjectTile(project: project),
          ],
        ),
      ),
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
