import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user_profile_model.dart';
import 'supabase_service.dart';

class UsersService {
  final SupabaseClient _client = SupabaseService().client;

  /// Fetch current user profile
  Future<UserProfileModel?> getCurrentUserProfile() async {
    final user = _client.auth.currentUser;
    if (user == null) return null;

    try {
      final res = await _client
          .from('user_profiles')
          .select('*, team:teams(name)')
          .eq('id', user.id)
          .maybeSingle();

      if (res == null) {
        // Fallback default from auth user metadata
        return UserProfileModel(
          id: user.id,
          fullName: user.userMetadata?['full_name']?.toString() ?? user.email?.split('@')[0] ?? 'User',
          email: user.email ?? '',
          role: user.userMetadata?['role']?.toString() ?? 'sales',
        );
      }

      return UserProfileModel.fromJson(res);
    } catch (_) {
      return UserProfileModel(
        id: user.id,
        fullName: user.userMetadata?['full_name']?.toString() ?? user.email?.split('@')[0] ?? 'User',
        email: user.email ?? '',
        role: user.userMetadata?['role']?.toString() ?? 'sales',
      );
    }
  }

  /// Get list of active agents/users available for assignment
  Future<List<UserProfileModel>> getAssignableUsers() async {
    try {
      final res = await _client
          .from('user_profiles')
          .select('*')
          .eq('is_active', true)
          .order('full_name', ascending: true);

      final list = res as List<dynamic>;
      return list.map((e) => UserProfileModel.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  /// Get list of user IDs that this user is authorized to view.
  /// - Returns `null` if Admin/Owner (unrestricted, sees all).
  /// - Returns `[leaderId, ...teamMemberIds]` if Team Leader.
  /// - Returns `[userId]` if Regular Agent.
  Future<List<String>?> getAuthorizedUserIds() async {
    final profile = await getCurrentUserProfile();
    if (profile == null) return [];
    if (profile.isAdmin) return null; // Unrestricted

    if (profile.isTeamLeader) {
      try {
        final currentUserId = profile.id;
        // Fetch teams led by this user
        final teamsRes = await _client.from('teams').select('id').eq('leader_id', currentUserId);
        final teamIds = (teamsRes as List<dynamic>)
            .map((t) => t['id']?.toString())
            .whereType<String>()
            .toList();

        final memberIds = <String>{currentUserId};
        if (teamIds.isNotEmpty) {
          final membersRes = await _client
              .from('team_memberships')
              .select('user_id')
              .inFilter('team_id', teamIds);
          for (final m in membersRes as List<dynamic>) {
            final uid = m['user_id']?.toString();
            if (uid != null && uid.isNotEmpty) {
              memberIds.add(uid);
            }
          }
        }
        return memberIds.toList();
      } catch (_) {
        return [profile.id];
      }
    }

    // Regular Agent: only own records
    return [profile.id];
  }
}
