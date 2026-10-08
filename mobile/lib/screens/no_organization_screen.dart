import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'organization_screen.dart';

/// Signed in but a member of nothing yet (removed from the last
/// organization, or an account that never got added). Create one, or wait to
/// be added by email.
class NoOrganizationScreen extends StatelessWidget {
  const NoOrganizationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Icon(Icons.groups_outlined, size: 56, color: Brand.stone),
            const SizedBox(height: 16),
            const Text('You are not in an organization yet', textAlign: TextAlign.center, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text('${state.user?.email ?? 'Your email'} can be added by an owner or admin of an existing organization. Or start your own and add your team.', textAlign: TextAlign.center, style: const TextStyle(color: Brand.stone, height: 1.4)),
            const SizedBox(height: 28),
            FilledButton.icon(onPressed: () => _create(context), icon: const Icon(Icons.add_business_outlined), label: const Text('Create an organization')),
            const SizedBox(height: 10),
            OutlinedButton(onPressed: state.refresh, child: const Text('I was added, refresh')),
            const SizedBox(height: 10),
            TextButton(onPressed: state.signOut, child: const Text('Sign out')),
          ]),
        ),
      ),
    );
  }

  static Future<void> _create(BuildContext context) async {
    final state = AppScope.of(context);
    final input = await showModalBottomSheet<({String name, String type})>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Brand.paper,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (context) => const OrganizationFormSheet(),
    );
    if (input == null || !context.mounted) return;
    try {
      await state.createOrganization(name: input.name, type: input.type);
    } on ApiException catch (error) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
    }
  }
}
