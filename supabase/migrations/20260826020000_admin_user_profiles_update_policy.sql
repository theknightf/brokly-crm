-- ============================================================
-- Brokly CRM - Allow admins/owners to manage user profiles
-- Migration: 20260826020000_admin_user_profiles_update_policy.sql
--
-- Policy: admins_manage_profiles
-- Allows users with role 'admin' or 'owner' to update any user profile.
-- Fixes PGRST116 "Cannot coerce the result to a single JSON object"
-- when an admin edits another user (e.g. assigning team leader).
-- ============================================================

DROP POLICY IF EXISTS admins_manage_profiles ON public.user_profiles;

CREATE POLICY admins_manage_profiles
  ON public.user_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
        AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
        AND is_active = true
    )
  );
