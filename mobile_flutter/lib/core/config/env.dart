/// Environment configuration for Brokly Mobile.
/// Fallback constants are embedded for convenience, with runtime override
/// via `--dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...`
class Env {
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://bhdxlmusufwwioghahec.supabase.co',
  );

  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoZHhsbXVzdWZ3d2lvZ2hhaGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3OTU4MTksImV4cCI6MjEwMTM3MTgxOX0.g3rPRAJ_PcbTbtxDLNV1JNRRCsAOE7bZYxv_sDys3EM',
  );

  /// Default Cairo Office coordinates and radius (meters) matching PWA settings
  static const double defaultOfficeLat = 30.0444;
  static const double defaultOfficeLng = 31.2357;
  static const double defaultOfficeRadiusM = 800.0;
}
