import 'geo.dart';

class AppUser {
  const AppUser({required this.id, required this.name, required this.email});

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
      );

  final String id;
  final String name;
  final String email;
}

class Organization {
  const Organization({required this.id, required this.name, required this.personal});

  factory Organization.fromJson(Map<String, dynamic> json) => Organization(
        id: json['id'] as String,
        name: json['name'] as String,
        personal: json['personal'] as bool? ?? false,
      );

  final String id;
  final String name;
  final bool personal;
}

const Map<String, String> roleLabels = {
  'OWNER': 'Owner',
  'ADMIN': 'Admin',
  'PROGRAM_MANAGER': 'Program manager',
  'VERIFIER': 'Verifier',
  'FIELD_WORKER': 'Field worker',
  'VIEWER': 'Viewer',
};

class Membership {
  const Membership({required this.organization, required this.role, required this.permissions});

  factory Membership.fromJson(Map<String, dynamic> json) => Membership(
        organization: Organization.fromJson(json['organization'] as Map<String, dynamic>),
        role: json['role'] as String,
        permissions: (json['permissions'] as List<dynamic>).cast<String>(),
      );

  final Organization organization;
  final String role;
  final List<String> permissions;

  String get roleLabel => roleLabels[role] ?? role;
  bool can(String permission) => permissions.contains(permission);
}

class CaptureProject {
  const CaptureProject({required this.id, required this.name, required this.sites, this.location});

  factory CaptureProject.fromJson(Map<String, dynamic> json) => CaptureProject(
        id: json['id'] as String,
        name: json['name'] as String,
        location: json['location'] as String?,
        sites: (json['sites'] as List<dynamic>? ?? const [])
            .map((site) => Site.fromJson(site as Map<String, dynamic>))
            .toList(),
      );

  final String id;
  final String name;
  final String? location;
  final List<Site> sites;
}

/// Trust wording mirrors the web app: nothing is "fraud", only "needs a second look".
const Map<String, String> trustLabels = {
  'STRONG': 'Strong',
  'MODERATE': 'Moderate',
  'NEEDS_SECOND_LOOK': 'Needs a second look',
  'NOT_ASSESSED': 'Not assessed',
};

const Map<String, String> reviewLabels = {
  'PENDING': 'Awaiting review',
  'APPROVED': 'Approved',
  'REJECTED': 'Rejected',
  'RESHOOT_REQUESTED': 'Re-shoot requested',
};
