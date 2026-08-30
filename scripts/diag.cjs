const { createClient } = require('@supabase/supabase-js');
const URL = 'https://bhdxlmusufwwioghahec.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ids = [
  '2a7fb56e-5668-4469-aff7-e9050549a5b5',
  'c3cfdc39-978e-47aa-953b-30b8243dc01e',
];
(async () => {
  const s = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const id of ids) {
    const { data: u, error: ge } = await s.auth.admin.getUserById(id);
    console.log('USER', id, 'email=', u?.user?.email, 'getErr=', ge ? JSON.stringify(ge) : 'none');
    const { error } = await s.auth.admin.deleteUser(id);
    console.log('DELETE', id, 'err=', JSON.stringify(error));
  }
})();
