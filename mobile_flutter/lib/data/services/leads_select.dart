/// Canonical PostgREST select strings for `public.leads`.
///
/// `leads` has multiple foreign keys to `user_profiles`, so every embed must
/// carry an explicit FK hint. Keep them here so the list and detail loaders
/// cannot drift (mirrors src/lib/supabase/leadsSelect.ts on the web app).
class LeadsSelect {
  static const String assignedToFk = 'leads_assigned_to_fkey';
  static const String createdByFk = 'leads_created_by_fkey';

  static const String assignedProfileEmbed =
      'assigned_to_profile:user_profiles!$assignedToFk';

  /// Main leads list select.
  static const String list =
      '*, ' + assignedProfileEmbed + '(id, full_name)';

  /// Single lead / detail select.
  static const String detail =
      '*, ' + assignedProfileEmbed + '(id, full_name)';
}
