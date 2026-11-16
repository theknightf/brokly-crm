import '../../data/models/user_profile_model.dart';

/// Plain sales agents (role 'agent', legacy 'sales') only get the Leads and Follow-ups pages.
/// Team leaders, admins and owners keep the full app.
bool isSalesAgent(UserProfileModel? p) {
  if (p == null) return false;
  final r = p.role.toLowerCase().trim().replaceAll('-', '_');
  return r == 'agent' || r == 'sales';
}
