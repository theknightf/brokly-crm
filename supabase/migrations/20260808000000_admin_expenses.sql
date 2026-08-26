-- ============================================================
-- Brokly CRM - Admin Expenses
-- Migration: 20260808000000_admin_expenses.sql
--
-- Tracks office / branch operational expenses (electricity, water,
-- rent, kitchen & staff wages, internet, supplies, transport, etc.)
-- so owners & admins can monitor monthly running costs.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by_date ON public.expenses(created_by, expense_date DESC);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Expenses are private operational data: only owners & admins read/write.
DROP POLICY IF EXISTS "admins_view_expenses" ON public.expenses;
CREATE POLICY "admins_view_expenses"
  ON public.expenses FOR SELECT TO authenticated
  USING (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "admins_insert_expenses" ON public.expenses;
CREATE POLICY "admins_insert_expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "admins_update_expenses" ON public.expenses;
CREATE POLICY "admins_update_expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner_v2())
  WITH CHECK (public.is_admin_or_owner_v2());

DROP POLICY IF EXISTS "admins_delete_expenses" ON public.expenses;
CREATE POLICY "admins_delete_expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (public.is_admin_or_owner_v2());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;