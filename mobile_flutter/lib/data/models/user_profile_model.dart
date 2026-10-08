/// User Profile Model mirroring Brokly CRM user_profiles table
class UserProfileModel {
  final String id;
  final String fullName;
  final String email;
  final String role; // 'admin' | 'owner' | 'manager' | 'team_leader' | 'sales' | 'agent'
  final String? phone;
  final String? teamId;
  final String? teamName;
  final String? branchId;
  final bool isActive;
  final String? avatarUrl;

  UserProfileModel({
    required this.id,
    required this.fullName,
    required this.email,
    this.role = 'sales',
    this.phone,
    this.teamId,
    this.teamName,
    this.branchId,
    this.isActive = true,
    this.avatarUrl,
  });

  bool get isAdmin {
    final r = role.toLowerCase().trim().replaceAll('-', '_');
    return r == 'admin' || r == 'owner' || r == 'owner_admin' || r == 'owneradmin';
  }

  bool get isTeamLeader {
    final r = role.toLowerCase().trim().replaceAll('-', '_');
    return r == 'team_leader' || r == 'manager' || r == 'team_lead';
  }

  String get initials {
    final parts = fullName.trim().split(' ');
    if (parts.isEmpty || parts[0].isEmpty) return 'U';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }

  factory UserProfileModel.fromJson(Map<String, dynamic> json) {
    return UserProfileModel(
      id: json['id']?.toString() ?? '',
      fullName: json['full_name']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      role: json['role']?.toString() ?? 'sales',
      phone: json['phone']?.toString(),
      teamId: json['team_id']?.toString(),
      teamName: json['team'] is Map ? json['team']['name']?.toString() : json['team_name']?.toString(),
      branchId: json['branch_id']?.toString(),
      isActive: json['is_active'] != false,
      avatarUrl: json['avatar_url']?.toString(),
    );
  }
}
