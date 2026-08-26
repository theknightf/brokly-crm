-- ============================================================
-- Brokly CRM - Full Production Schema
-- Migration: 20260804002527_brokly_crm_schema.sql
-- ============================================================

-- ─── 1. TYPES ────────────────────────────────────────────────────────────────

DROP TYPE IF EXISTS public.user_role CASCADE;
CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'broker', 'branch_manager', 'senior_agent', 'agent', 'telecaller');

DROP TYPE IF EXISTS public.lead_status CASCADE;
CREATE TYPE public.lead_status AS ENUM ('New', 'Contacted', 'Qualified', 'Site Visit Scheduled', 'Site Visited', 'Negotiation', 'Won', 'Lost');

DROP TYPE IF EXISTS public.follow_up_status CASCADE;
CREATE TYPE public.follow_up_status AS ENUM ('Pending', 'In Progress', 'Completed', 'Overdue', 'Cancelled');

DROP TYPE IF EXISTS public.follow_up_type CASCADE;
CREATE TYPE public.follow_up_type AS ENUM ('Call', 'Email', 'Site Visit', 'Meeting', 'WhatsApp', 'Video Call');

DROP TYPE IF EXISTS public.follow_up_priority CASCADE;
CREATE TYPE public.follow_up_priority AS ENUM ('High', 'Medium', 'Low');

DROP TYPE IF EXISTS public.contact_type CASCADE;
CREATE TYPE public.contact_type AS ENUM ('Lead', 'Customer');

DROP TYPE IF EXISTS public.relationship_status CASCADE;
CREATE TYPE public.relationship_status AS ENUM ('New', 'Nurturing', 'Negotiating', 'Closed Won', 'Closed Lost', 'At Risk', 'Loyal');

DROP TYPE IF EXISTS public.team_role CASCADE;
CREATE TYPE public.team_role AS ENUM ('Broker', 'Senior Agent', 'Agent', 'Junior Agent', 'Team Lead');

DROP TYPE IF EXISTS public.member_status CASCADE;
CREATE TYPE public.member_status AS ENUM ('Active', 'Inactive');

DROP TYPE IF EXISTS public.project_status CASCADE;
CREATE TYPE public.project_status AS ENUM ('Active', 'Inactive');

-- ─── 2. CORE TABLES ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  role public.user_role DEFAULT 'agent'::public.user_role,
  brokerage_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.developers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  developer_id UUID REFERENCES public.developers(id) ON DELETE SET NULL,
  project_status public.project_status DEFAULT 'Active'::public.project_status,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  initials TEXT NOT NULL DEFAULT '',
  role public.team_role DEFAULT 'Agent'::public.team_role,
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  member_status public.member_status DEFAULT 'Active'::public.member_status,
  assigned_leads INTEGER DEFAULT 0,
  closed_deals INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,2) DEFAULT 0,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  joined_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  property_type TEXT DEFAULT '',
  budget_min NUMERIC(12,2) DEFAULT 0,
  budget_max NUMERIC(12,2) DEFAULT 0,
  source TEXT DEFAULT '',
  agent TEXT DEFAULT '',
  agent_initials TEXT DEFAULT '',
  lead_status public.lead_status DEFAULT 'New'::public.lead_status,
  last_contact DATE DEFAULT CURRENT_DATE,
  follow_up_due DATE DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  location TEXT DEFAULT '',
  developer TEXT DEFAULT '',
  project TEXT DEFAULT '',
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_type public.contact_type DEFAULT 'Lead'::public.contact_type,
  contact_phone TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  follow_up_type public.follow_up_type DEFAULT 'Call'::public.follow_up_type,
  follow_up_status public.follow_up_status DEFAULT 'Pending'::public.follow_up_status,
  priority public.follow_up_priority DEFAULT 'Medium'::public.follow_up_priority,
  due_date DATE NOT NULL,
  due_time TEXT DEFAULT '09:00',
  agent TEXT DEFAULT '',
  agent_initials TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  property_interest TEXT DEFAULT '',
  relationship_status public.relationship_status DEFAULT 'New'::public.relationship_status,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── 3. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_leads_lead_status ON public.leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON public.leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_ups_follow_up_status ON public.follow_ups(follow_up_status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due_date ON public.follow_ups(due_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_created_by ON public.follow_ups(created_by);
CREATE INDEX IF NOT EXISTS idx_team_members_member_status ON public.team_members(member_status);
CREATE INDEX IF NOT EXISTS idx_projects_developer_id ON public.projects(developer_id);
CREATE INDEX IF NOT EXISTS idx_admin_settings_category ON public.admin_settings(category);

-- ─── 4. FUNCTIONS ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role, brokerage_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'agent')::public.user_role,
    COALESCE(NEW.raw_user_meta_data->>'brokerage_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.user_profiles
  WHERE id = auth.uid()
  AND role IN ('admin', 'owner')
)
$$;

-- ─── 5. ENABLE RLS ───────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- ─── 6. RLS POLICIES ─────────────────────────────────────────────────────────

-- user_profiles: own row + admins see all
DROP POLICY IF EXISTS "users_manage_own_profile" ON public.user_profiles;
CREATE POLICY "users_manage_own_profile"
ON public.user_profiles FOR ALL TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "authenticated_view_all_profiles" ON public.user_profiles;
CREATE POLICY "authenticated_view_all_profiles"
ON public.user_profiles FOR SELECT TO authenticated
USING (true);

-- leads: all authenticated users can CRUD
DROP POLICY IF EXISTS "authenticated_manage_leads" ON public.leads;
CREATE POLICY "authenticated_manage_leads"
ON public.leads FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- follow_ups: all authenticated users can CRUD
DROP POLICY IF EXISTS "authenticated_manage_follow_ups" ON public.follow_ups;
CREATE POLICY "authenticated_manage_follow_ups"
ON public.follow_ups FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- team_members: all authenticated users can read; admins can write
DROP POLICY IF EXISTS "authenticated_view_team_members" ON public.team_members;
CREATE POLICY "authenticated_view_team_members"
ON public.team_members FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "authenticated_manage_team_members" ON public.team_members;
CREATE POLICY "authenticated_manage_team_members"
ON public.team_members FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- projects: all authenticated users can CRUD
DROP POLICY IF EXISTS "authenticated_manage_projects" ON public.projects;
CREATE POLICY "authenticated_manage_projects"
ON public.projects FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- developers: all authenticated users can CRUD
DROP POLICY IF EXISTS "authenticated_manage_developers" ON public.developers;
CREATE POLICY "authenticated_manage_developers"
ON public.developers FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- admin_settings: all authenticated users can read; admins write
DROP POLICY IF EXISTS "authenticated_view_admin_settings" ON public.admin_settings;
CREATE POLICY "authenticated_view_admin_settings"
ON public.admin_settings FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "authenticated_manage_admin_settings" ON public.admin_settings;
CREATE POLICY "authenticated_manage_admin_settings"
ON public.admin_settings FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- ─── 7. TRIGGERS ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS follow_ups_updated_at ON public.follow_ups;
CREATE TRIGGER follow_ups_updated_at
  BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS team_members_updated_at ON public.team_members;
CREATE TRIGGER team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 8. SEED DATA ────────────────────────────────────────────────────────────

-- Admin Settings: Lead Sources
INSERT INTO public.admin_settings (category, name, color, sort_order, is_active) VALUES
  ('leadSources', 'Facebook', '#1877F2', 1, true),
  ('leadSources', 'Instagram', '#E1306C', 2, true),
  ('leadSources', 'TikTok', '#010101', 3, true),
  ('leadSources', 'Website', '#6366f1', 4, true),
  ('leadSources', 'WhatsApp', '#25D366', 5, true),
  ('leadSources', 'Referral', '#f59e0b', 6, true),
  ('leadSources', 'Word of Mouth', '#8b5cf6', 7, true),
  ('leadSources', 'Existing Client', '#10b981', 8, true),
  ('leadSources', 'Sales Referral', '#3b82f6', 9, true),
  ('leadSources', 'Property Portal', '#ef4444', 10, true),
  ('leadSources', 'Walk-in', '#14b8a6', 11, true)
ON CONFLICT DO NOTHING;

-- Admin Settings: Pipeline Stages
INSERT INTO public.admin_settings (category, name, color, sort_order, is_active) VALUES
  ('pipelineStages', 'New Lead', '#94a3b8', 1, true),
  ('pipelineStages', 'Contacted', '#3b82f6', 2, true),
  ('pipelineStages', 'Follow Up', '#8b5cf6', 3, true),
  ('pipelineStages', 'Interested', '#f59e0b', 4, true),
  ('pipelineStages', 'Meeting Scheduled', '#06b6d4', 5, true),
  ('pipelineStages', 'Site Visit', '#6366f1', 6, true),
  ('pipelineStages', 'Negotiation', '#f97316', 7, true),
  ('pipelineStages', 'Reservation', '#a855f7', 8, true),
  ('pipelineStages', 'Closed Won', '#22c55e', 9, true),
  ('pipelineStages', 'Closed Lost', '#ef4444', 10, true)
ON CONFLICT DO NOTHING;

-- Admin Settings: Areas
INSERT INTO public.admin_settings (category, name, sort_order, is_active) VALUES
  ('areas', 'New Cairo', 1, true),
  ('areas', '6th of October', 2, true),
  ('areas', 'Sheikh Zayed', 3, true),
  ('areas', 'Maadi', 4, true),
  ('areas', 'Zamalek', 5, true),
  ('areas', 'Heliopolis', 6, true),
  ('areas', 'North Coast', 7, true),
  ('areas', 'Ain Sokhna', 8, true),
  ('areas', 'New Administrative Capital', 9, true),
  ('areas', 'Mostakbal City', 10, true),
  ('areas', 'Obour City', 11, true),
  ('areas', 'Badr City', 12, true)
ON CONFLICT DO NOTHING;

-- Admin Settings: Priorities
INSERT INTO public.admin_settings (category, name, color, sort_order, is_active) VALUES
  ('priorities', 'Critical', '#ef4444', 1, true),
  ('priorities', 'High', '#f97316', 2, true),
  ('priorities', 'Medium', '#f59e0b', 3, true),
  ('priorities', 'Low', '#22c55e', 4, true)
ON CONFLICT DO NOTHING;

-- Developers
INSERT INTO public.developers (name, is_active) VALUES
  ('Palm Hills', true),
  ('Emaar Misr', true),
  ('SODIC', true),
  ('Ora Developers', true),
  ('Tatweer Misr', true),
  ('Mountain View', true),
  ('Talaat Moustafa Group', true),
  ('Marasem', true),
  ('Inertia', true),
  ('Hassan Allam Properties', true)
ON CONFLICT DO NOTHING;

-- Mock auth users + profiles
DO $$
DECLARE
  admin_uuid UUID := gen_random_uuid();
  agent_uuid UUID := gen_random_uuid();
  palm_hills_id UUID;
  emaar_id UUID;
  sodic_id UUID;
BEGIN
  -- Create admin user
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, email_change_token_current, email_change_confirm_status,
    reauthentication_token, reauthentication_sent_at, phone, phone_change,
    phone_change_token, phone_change_sent_at
  ) VALUES (
    admin_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'admin@brokly.io', crypt('Admin@2026', gen_salt('bf', 10)), now(), now(), now(),
    jsonb_build_object('full_name', 'Sarah Reynolds', 'role', 'admin', 'brokerage_name', 'Brokly Realty', 'phone', '+91-98001-00001'),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
    false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null
  ) ON CONFLICT (id) DO NOTHING;

  -- Create agent user
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_user_meta_data, raw_app_meta_data,
    is_sso_user, is_anonymous, confirmation_token, confirmation_sent_at,
    recovery_token, recovery_sent_at, email_change_token_new, email_change,
    email_change_sent_at, email_change_token_current, email_change_confirm_status,
    reauthentication_token, reauthentication_sent_at, phone, phone_change,
    phone_change_token, phone_change_sent_at
  ) VALUES (
    agent_uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'agent@brokly.io', crypt('Agent@2026', gen_salt('bf', 10)), now(), now(), now(),
    jsonb_build_object('full_name', 'Arjun Sharma', 'role', 'agent', 'brokerage_name', 'Brokly Realty', 'phone', '+91-98001-00002'),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']::TEXT[]),
    false, false, '', null, '', null, '', '', null, '', 0, '', null, null, '', '', null
  ) ON CONFLICT (id) DO NOTHING;

  -- Get developer IDs
  SELECT id INTO palm_hills_id FROM public.developers WHERE name = 'Palm Hills' LIMIT 1;
  SELECT id INTO emaar_id FROM public.developers WHERE name = 'Emaar Misr' LIMIT 1;
  SELECT id INTO sodic_id FROM public.developers WHERE name = 'SODIC' LIMIT 1;

  -- Seed projects
  IF palm_hills_id IS NOT NULL THEN
    INSERT INTO public.projects (name, developer_id, project_status, created_by) VALUES
      ('Palm Hills New Cairo', palm_hills_id, 'Active'::public.project_status, admin_uuid),
      ('Palm Hills October', palm_hills_id, 'Active'::public.project_status, admin_uuid),
      ('Palm Hills Alexandria', palm_hills_id, 'Active'::public.project_status, admin_uuid)
    ON CONFLICT DO NOTHING;
  END IF;

  IF emaar_id IS NOT NULL THEN
    INSERT INTO public.projects (name, developer_id, project_status, created_by) VALUES
      ('Emaar Mirage City', emaar_id, 'Active'::public.project_status, admin_uuid),
      ('Emaar Uptown Cairo', emaar_id, 'Active'::public.project_status, admin_uuid),
      ('Emaar Golf Views', emaar_id, 'Inactive'::public.project_status, admin_uuid)
    ON CONFLICT DO NOTHING;
  END IF;

  IF sodic_id IS NOT NULL THEN
    INSERT INTO public.projects (name, developer_id, project_status, created_by) VALUES
      ('SODIC East', sodic_id, 'Active'::public.project_status, admin_uuid),
      ('SODIC West', sodic_id, 'Active'::public.project_status, admin_uuid)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Seed team members
  INSERT INTO public.team_members (name, initials, role, email, phone, member_status, assigned_leads, closed_deals, conversion_rate, total_revenue, joined_at) VALUES
    ('Sarah Reynolds', 'SR', 'Broker'::public.team_role, 'sarah.reynolds@brokly.io', '+91-98001-00001', 'Active'::public.member_status, 0, 42, 68, 1240000, '2022-01-15'),
    ('Arjun Sharma', 'AS', 'Senior Agent'::public.team_role, 'arjun.sharma@brokly.io', '+91-98001-00002', 'Active'::public.member_status, 4, 28, 54, 820000, '2022-06-10'),
    ('Neha Patel', 'NP', 'Agent'::public.team_role, 'neha.patel@brokly.io', '+91-98001-00003', 'Active'::public.member_status, 3, 19, 47, 560000, '2023-02-20'),
    ('Vikram Singh', 'VS', 'Senior Agent'::public.team_role, 'vikram.singh@brokly.io', '+91-98001-00004', 'Active'::public.member_status, 3, 24, 51, 710000, '2022-09-05'),
    ('Priya Nair', 'PN', 'Agent'::public.team_role, 'priya.nair@brokly.io', '+91-98001-00005', 'Active'::public.member_status, 2, 15, 43, 430000, '2023-07-12'),
    ('Rohan Mehta', 'RM', 'Junior Agent'::public.team_role, 'rohan.mehta@brokly.io', '+91-98001-00006', 'Active'::public.member_status, 2, 6, 30, 180000, '2024-03-01'),
    ('Divya Kapoor', 'DK', 'Team Lead'::public.team_role, 'divya.kapoor@brokly.io', '+91-98001-00007', 'Inactive'::public.member_status, 0, 11, 38, 320000, '2023-11-18')
  ON CONFLICT (email) DO NOTHING;

  -- Seed leads
  INSERT INTO public.leads (name, phone, email, property_type, budget_min, budget_max, source, agent, agent_initials, lead_status, last_contact, follow_up_due, notes, location, created_by) VALUES
    ('Priya Mehta', '+91-98765-43210', 'priya.mehta@gmail.com', '3BHK Apartment', 120, 150, 'Property Portal', 'Arjun Sharma', 'AS', 'Qualified'::public.lead_status, '2026-07-31', '2026-08-01', 'Interested in Powai area, has pre-approved loan', 'Mumbai', admin_uuid),
    ('Rohit Verma', '+91-87654-32109', 'rohit.v@outlook.com', '2BHK Apartment', 65, 80, 'Referral', 'Neha Patel', 'NP', 'Site Visit Scheduled'::public.lead_status, '2026-08-02', '2026-08-05', 'Referred by Suresh Iyer, wants possession by Dec', 'Pune', admin_uuid),
    ('Ananya Shah', '+91-76543-21098', 'ananya.shah@yahoo.com', 'Villa', 250, 320, 'Property Portal', 'Vikram Singh', 'VS', 'Site Visited'::public.lead_status, '2026-08-02', '2026-08-04', 'Visited Heritage Villas, liked Unit 14B', 'Bangalore', admin_uuid),
    ('Deepak Nair', '+91-65432-10987', 'deepak.nair@gmail.com', '2BHK Apartment', 55, 70, 'Property Portal', 'Arjun Sharma', 'AS', 'New'::public.lead_status, '2026-08-03', '2026-08-04', 'Fresh lead, first response pending', 'Hyderabad', admin_uuid),
    ('Kavya Reddy', '+91-54321-09876', 'kavya.reddy@company.in', 'Commercial Space', 180, 240, 'Referral', 'Priya Nair', 'PN', 'Negotiation'::public.lead_status, '2026-08-01', '2026-08-03', 'Wants ground floor, 2000 sqft minimum', 'Chennai', admin_uuid),
    ('Amit Desai', '+91-43210-98765', 'amit.desai@businessmail.com', '4BHK Penthouse', 400, 500, 'Walk-in', 'Vikram Singh', 'VS', 'Contacted'::public.lead_status, '2026-07-30', '2026-08-06', 'Sea-facing requirement, Worli or BKC preferred', 'Mumbai', admin_uuid),
    ('Meera Joshi', '+91-10987-65432', 'meera.joshi@corporate.io', '3BHK Apartment', 130, 160, 'Referral', 'Priya Nair', 'PN', 'Won'::public.lead_status, '2026-08-03', '2026-08-10', 'Deal closed - Unit 8C, Powai. Handover Dec 2026', 'Mumbai', admin_uuid),
    ('Suresh Iyer', '+91-90876-54321', 'suresh.iyer@techcorp.in', 'Office Space', 300, 420, 'Property Portal', 'Vikram Singh', 'VS', 'Negotiation'::public.lead_status, '2026-08-02', '2026-08-05', 'Price negotiation ongoing, flexible on floor', 'Bangalore', admin_uuid)
  ON CONFLICT DO NOTHING;

  -- Seed follow-ups
  INSERT INTO public.follow_ups (title, contact_name, contact_type, contact_phone, contact_email, follow_up_type, follow_up_status, priority, due_date, due_time, agent, agent_initials, notes, property_interest, relationship_status, created_by) VALUES
    ('Follow up on site visit feedback', 'Ananya Shah', 'Lead'::public.contact_type, '+91-76543-21098', 'ananya.shah@yahoo.com', 'Call'::public.follow_up_type, 'Overdue'::public.follow_up_status, 'High'::public.follow_up_priority, '2026-08-01', '10:00', 'Vikram Singh', 'VS', 'She visited Heritage Villas Unit 14B. Need to get her final decision.', 'Villa - Heritage Villas', 'Negotiating'::public.relationship_status, admin_uuid),
    ('Send revised pricing proposal', 'Suresh Iyer', 'Lead'::public.contact_type, '+91-90876-54321', 'suresh.iyer@techcorp.in', 'Email'::public.follow_up_type, 'Pending'::public.follow_up_status, 'High'::public.follow_up_priority, '2026-08-05', '11:00', 'Vikram Singh', 'VS', 'Client wants revised pricing for 5000 sqft office. Include parking details.', 'Office Space - Prestige Tech Park', 'Nurturing'::public.relationship_status, admin_uuid),
    ('Schedule second site visit', 'Rohit Verma', 'Lead'::public.contact_type, '+91-87654-32109', 'rohit.v@outlook.com', 'WhatsApp'::public.follow_up_type, 'Pending'::public.follow_up_status, 'Medium'::public.follow_up_priority, '2026-08-05', '14:00', 'Neha Patel', 'NP', 'First visit went well. Wants to bring spouse for second visit.', '2BHK Apartment - Godrej Horizon', 'Nurturing'::public.relationship_status, admin_uuid),
    ('Post-purchase handover checklist', 'Meera Joshi', 'Customer'::public.contact_type, '+91-10987-65432', 'meera.joshi@corporate.io', 'Call'::public.follow_up_type, 'Completed'::public.follow_up_status, 'Low'::public.follow_up_priority, '2026-08-03', '10:00', 'Priya Nair', 'PN', 'Confirmed handover date Dec 2026. Sent checklist via email.', '3BHK Apartment - Unit 8C Powai', 'Loyal'::public.relationship_status, admin_uuid),
    ('Negotiate final price for commercial space', 'Kavya Reddy', 'Lead'::public.contact_type, '+91-54321-09876', 'kavya.reddy@company.in', 'Video Call'::public.follow_up_type, 'Overdue'::public.follow_up_status, 'High'::public.follow_up_priority, '2026-08-03', '12:00', 'Priya Nair', 'PN', 'Client wants 5% discount. Check with broker before confirming.', 'Commercial Space - DLF Cyber City', 'At Risk'::public.relationship_status, admin_uuid)
  ON CONFLICT DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Seed data error: %', SQLERRM;
END $$;
