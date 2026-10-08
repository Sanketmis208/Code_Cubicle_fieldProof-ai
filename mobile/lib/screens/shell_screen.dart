import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme.dart';
import 'capture_picker_screen.dart';
import 'dashboard_screen.dart';
import 'organization_screen.dart';
import 'profile_screen.dart';
import 'projects_screen.dart';
import 'review_screen.dart';

/// Bottom navigation, shaped by the person's role: field workers get Capture,
/// reviewers get Review, everyone gets Home, Projects and Me.
class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final tabs = <({String label, IconData icon, IconData activeIcon, Widget screen})>[
      (label: 'Home', icon: Icons.home_outlined, activeIcon: Icons.home, screen: const DashboardScreen()),
      (label: 'Projects', icon: Icons.folder_outlined, activeIcon: Icons.folder, screen: const ProjectsScreen()),
      if (state.can('evidence.upload'))
        (label: 'Capture', icon: Icons.photo_camera_outlined, activeIcon: Icons.photo_camera, screen: const CapturePickerScreen()),
      if (state.can('evidence.review'))
        (label: 'Review', icon: Icons.fact_check_outlined, activeIcon: Icons.fact_check, screen: const ReviewScreen()),
      if (state.can('org.members.view'))
        (label: 'Org', icon: Icons.groups_outlined, activeIcon: Icons.groups, screen: const OrganizationScreen()),
      (label: 'Me', icon: Icons.person_outline, activeIcon: Icons.person, screen: const ProfileScreen()),
    ];
    final index = _index.clamp(0, tabs.length - 1);
    return Scaffold(
      body: IndexedStack(index: index, children: [for (final tab in tabs) tab.screen]),
      bottomNavigationBar: ListenableBuilder(
        listenable: state.queue,
        builder: (context, _) => NavigationBar(
          key: ValueKey(tabs.length),
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          selectedIndex: index,
          onDestinationSelected: (value) => setState(() => _index = value),
          backgroundColor: Colors.white,
          indicatorColor: Brand.lime,
          destinations: [
            for (final tab in tabs)
              NavigationDestination(
                icon: tab.label == 'Me' && state.queue.waiting > 0
                    ? Badge(label: Text('${state.queue.waiting}'), child: Icon(tab.icon))
                    : Icon(tab.icon),
                selectedIcon: Icon(tab.activeIcon),
                label: tab.label,
              ),
          ],
        ),
      ),
    );
  }
}
