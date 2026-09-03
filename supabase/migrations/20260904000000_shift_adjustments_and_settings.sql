-- Shift scheduling — fix schema problem: missing tables for TeamShiftAdjustment + CompanySetting
-- Covers src/lib/teamShiftAdjustmentsService.ts and src/app/api/attendance/team-shift/route.ts
-- Previously relied on company_settings JSON fallback only; now creates proper relation for atomic queries

CREATE TABLE IF NOT EXISTS public.company_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_company_settings_key ON public.company_settings(key);

CREATE TABLE IF NOT EXISTS public.team_shift_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name TEXT NOT NULL,
  date DATE, -- NULL = permanent adjustment, DATE = temporary (single-day)
  start_time TEXT NOT NULL CHECK (start_time ~ '^\d{1,2}:\d{2}$'),
  end_time TEXT NOT NULL CHECK (end_time ~ '^\d{1,2}:\d{2}$'),
  grace_minutes INTEGER NOT NULL DEFAULT 20 CHECK (grace_minutes BETWEEN 0 AND 120),
  reason TEXT DEFAULT '',
  is_temporary BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_team_shift_adj_team_date ON public.team_shift_adjustments(team_name, date);
CREATE INDEX IF NOT EXISTS idx_team_shift_adj_team_id ON public.team_shift_adjustments(team_id);

-- RLS: authenticated users can read; admins can write (mirrors isAdminRole check in API)
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_shift_adjustments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_settings' AND policyname='company_settings_select_all') THEN
    CREATE POLICY company_settings_select_all ON public.company_settings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_settings' AND policyname='company_settings_upsert_admin') THEN
    CREATE POLICY company_settings_upsert_admin ON public.company_settings FOR ALL TO authenticated USING (
      EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('owner','admin','OWNER_ADMIN','branch_manager'))
    ) WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('owner','admin','OWNER_ADMIN','branch_manager'))
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_shift_adjustments' AND policyname='team_shift_adj_select') THEN
    CREATE POLICY team_shift_adj_select ON public.team_shift_adjustments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='team_shift_adjustments' AND policyname='team_shift_adj_admin_all') THEN
    CREATE POLICY team_shift_adj_admin_all ON public.team_shift_adjustments FOR ALL TO authenticated USING (
      EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('owner','admin','OWNER_ADMIN','branch_manager'))
    ) WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('owner','admin','OWNER_ADMIN','branch_manager'))
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
