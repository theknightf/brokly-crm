// Wipes ALL leads and ALL auth users except those with user_profiles.role='owner'.
// Reads credentials from environment ONLY (never written to disk).
//   SUPABASE_URL            (optional; defaults to the brokly project)
//   SUPABASE_SERVICE_ROLE_KEY (required)
//   CONFIRM_WIPE=yes        (required to actually delete; otherwise dry-run)
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL || 'https://bhdxlmusufwwioghahec.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required.');
  process.exit(1);
}
const DRY = process.env.CONFIRM_WIPE !== 'yes';

(async () => {
  const supabase = createClient(URL, KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Identify owner(s) to keep ---
  const { data: owners, error: oErr } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role')
    .eq('role', 'owner');
  if (oErr) throw oErr;
  if (!owners || owners.length === 0) {
    console.error('ABORT: no user_profiles row with role=owner found. Nothing deleted.');
    process.exit(2);
  }
  const ownerIds = new Set(owners.map((o) => o.id));
  console.log('Owners to KEEP:', owners.map((o) => `${o.email || o.full_name} (${o.id})`).join(', '));

  // --- Count leads ---
  const { count: leadCount, error: lcErr } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true });
  if (lcErr) throw lcErr;
  console.log(`Leads present: ${leadCount}`);

  // --- List all auth users ---
  const allUsers = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (!data.users || data.users.length === 0) break;
    allUsers.push(...data.users);
    if (data.users.length < 200) break;
    page++;
  }
  const toDelete = allUsers.filter((u) => !ownerIds.has(u.id));
  console.log(
    `Auth users total: ${allUsers.length}, to DELETE: ${toDelete.length}, to KEEP: ${allUsers.length - toDelete.length}`
  );

  if (DRY) {
    console.log('\n*** DRY RUN — no changes made. Set CONFIRM_WIPE=yes to execute. ***');
    process.exit(0);
  }

  // --- Delete all leads (service role bypasses RLS) ---
  const { error: delErr } = await supabase
    .from('leads')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw delErr;
  console.log('Deleted all leads.');

  // --- Delete non-owner auth users (cascades to their user_profiles) ---
  let deleted = 0;
  let failed = 0;
  for (const u of toDelete) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) {
      failed++;
      console.error(`Failed to delete ${u.id}: ${error.message}`);
    } else {
      deleted++;
    }
  }
  console.log(`Deleted ${deleted} auth users, ${failed} failed.`);
  console.log('DONE.');
})().catch((e) => {
  console.error('ERROR:', e.message || e);
  process.exit(1);
});
