-- ============================================================
-- Brokly CRM - Allow admins/owners to manage user profiles
-- Migration: 20260826020000_admin_user_profiles_update_policy.sql
--
-- Policy: admins_manage_profiles
-- Allows users with role 'admin' or 'owner' to update any user profile.
-- ============================================================

do 
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'admins_manage_profiles') then
    create policy admins_manage_profiles
      on public.user_profiles
      for update
      using (
        exists (
          select 1 from public.user_profiles
          where id = auth.uid()
            and role in ('admin', 'owner')
            and is_active = true
        )
      )
      with check (
        exists (
          select 1 from public.user_profiles
          where id = auth.uid()
            and role in ('admin', 'owner')
            and is_active = true
        )
      );
  end if;
end ;
