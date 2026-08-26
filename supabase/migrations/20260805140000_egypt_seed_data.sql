-- ============================================================
-- Brokly CRM - Egyptian mock data (Al-Minya governorate)
-- Migration: 20260805140000_egypt_seed_data.sql
--
-- Adds realistic Egyptian names + Al-Minya (Minya) projects,
-- areas, team members, leads, follow-ups and sample activity log
-- entries so every feature (dashboard, leads, follow-ups,
-- customers, teams, reports, activity-per-hour, attendance) can
-- be exercised end-to-end.
--
-- Also removes the original Indian sample rows (identifiable by
-- +91 phone numbers) so the dataset is coherent Egyptian/Minya.
-- Only seeded mock rows are touched - real rows are never deleted.
-- ============================================================

DO $$
DECLARE
  admin_id UUID := (SELECT id FROM public.user_profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1);
  dev_aton UUID;
  dev_mnc  UUID;
  dev_mg   UUID;
BEGIN

  -- ─── 1. CLEAN OUT OLD INDIAN MOCK DATA ────────────────────────────────────
  -- Only rows created by the original seed carry +91 numbers.
  DELETE FROM public.follow_ups    WHERE contact_phone LIKE '+91-%';
  DELETE FROM public.leads         WHERE phone LIKE '+91-%';
  DELETE FROM public.team_members  WHERE phone LIKE '+91-%' OR email LIKE '%@brokly.io';

  -- ─── 2. LOCAL DEVELOPERS ──────────────────────────────────────────────────
  INSERT INTO public.developers (name, is_active)
  SELECT 'Aton Real Estate',        true
  WHERE NOT EXISTS (SELECT 1 FROM public.developers WHERE name = 'Aton Real Estate');
  INSERT INTO public.developers (name, is_active)
  SELECT 'Minya for Development',   true
  WHERE NOT EXISTS (SELECT 1 FROM public.developers WHERE name = 'Minya for Development');
  INSERT INTO public.developers (name, is_active)
  SELECT 'El-Minya Garden',         true
  WHERE NOT EXISTS (SELECT 1 FROM public.developers WHERE name = 'El-Minya Garden');

  SELECT id INTO dev_aton FROM public.developers WHERE name = 'Aton Real Estate' LIMIT 1;
  SELECT id INTO dev_mnc  FROM public.developers WHERE name = 'Minya for Development' LIMIT 1;
  SELECT id INTO dev_mg   FROM public.developers WHERE name = 'El-Minya Garden' LIMIT 1;

  -- ─── 3. MINYA PROJECTS ────────────────────────────────────────────────────
  INSERT INTO public.projects (name, developer_id, project_status, created_by)
  SELECT 'Aton Compound – Kornish El-Nil', dev_aton, 'Active', admin_id
  WHERE dev_aton IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE name = 'Aton Compound – Kornish El-Nil');
  INSERT INTO public.projects (name, developer_id, project_status, created_by)
  SELECT 'Tuna el-Gebel Resort',           dev_aton, 'Inactive', admin_id
  WHERE dev_aton IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE name = 'Tuna el-Gebel Resort');

  INSERT INTO public.projects (name, developer_id, project_status, created_by)
  SELECT 'Al-Minya Garden Residences',     dev_mnc, 'Active', admin_id
  WHERE dev_mnc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE name = 'Al-Minya Garden Residences');
  INSERT INTO public.projects (name, developer_id, project_status, created_by)
  SELECT 'Mallawi Heights',                dev_mnc, 'Active', admin_id
  WHERE dev_mnc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE name = 'Mallawi Heights');

  INSERT INTO public.projects (name, developer_id, project_status, created_by)
  SELECT 'Samalut Villas',                 dev_mg, 'Active', admin_id
  WHERE dev_mg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE name = 'Samalut Villas');
  INSERT INTO public.projects (name, developer_id, project_status, created_by)
  SELECT 'Bani Mazar Commercial Hub',      dev_mg, 'Active', admin_id
  WHERE dev_mg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE name = 'Bani Mazar Commercial Hub');

  -- ─── 4. MINYA ADMIN AREAS ─────────────────────────────────────────────────
  INSERT INTO public.admin_settings (category, name, sort_order, is_active)
  SELECT 'areas', a.name, a.sort_order, true
  FROM (VALUES
    ('Minya City Center', 20),
    ('Kornish El-Nil Minya', 21),
    ('Abu Fana', 22),
    ('Tuna el-Gebel', 23),
    ('Mallawi', 24),
    ('Samalut', 25),
    ('Bani Mazar', 26),
    ('Maghagha', 27),
    ('Matay', 28),
    ('Deir Mawas', 29)
  ) AS a(name, sort_order)
  WHERE NOT EXISTS (SELECT 1 FROM public.admin_settings WHERE category = 'areas' AND name = a.name);

  -- ─── 5. EGYPTIAN TEAM MEMBERS ─────────────────────────────────────────────
  INSERT INTO public.team_members (name, initials, role, email, phone, member_status, assigned_leads, closed_deals, conversion_rate, total_revenue, joined_at) VALUES
    ('Ahmed Hassan',      'AH', 'Broker'::public.team_role,        'ahmed.hassan@minya-brokly.io',  '+20-100-000-0001', 'Active'::public.member_status,   12, 46, 71, 1340000, '2021-03-10'),
    ('Nour Khalil',       'NK', 'Team Lead'::public.team_role,     'nour.khalil@minya-brokly.io',   '+20-100-000-0002', 'Active'::public.member_status,    9, 33, 60,  985000, '2022-01-09'),
    ('Mohamed Ali',       'MA', 'Senior Agent'::public.team_role,  'mohamed.ali@minya-brokly.io',   '+20-100-000-0003', 'Active'::public.member_status,    8, 31, 58,  890000, '2022-05-20'),
    ('Mariam Kamel',      'MK', 'Senior Agent'::public.team_role,  'mariam.kamel@minya-brokly.io',  '+20-100-000-0004', 'Active'::public.member_status,    7, 27, 55,  740000, '2022-11-05'),
    ('Fatma El-Sayed',    'FE', 'Agent'::public.team_role,         'fatma.elsayed@minya-brokly.io', '+20-100-000-0005', 'Active'::public.member_status,    6, 24, 52,  660000, '2023-08-01'),
    ('Mahmoud Ibrahim',   'MI', 'Agent'::public.team_role,         'mahmoud.ibrahim@minya-brokly.io','+20-100-000-0006','Active'::public.member_status,    5, 21, 49,  610000, '2023-02-14'),
    ('Salma Abdelrahman', 'SA', 'Agent'::public.team_role,         'salma.abdelrahman@minya-brokly.io','+20-100-000-0007','Active'::public.member_status,   5, 18, 46,  520000, '2023-10-22'),
    ('Omar Farouk',       'OF', 'Junior Agent'::public.team_role,  'omar.farouk@minya-brokly.io',   '+20-100-000-0008', 'Active'::public.member_status,    4, 12, 41,  320000, '2024-03-18')
  ON CONFLICT (email) DO NOTHING;

  -- ─── 6. EGYPTIAN LEADS (Al-Minya) ─────────────────────────────────────────
  INSERT INTO public.leads (name, phone, email, property_type, budget_min, budget_max, source, agent, agent_initials, lead_status, last_contact, follow_up_due, notes, location, created_by) VALUES
    ('Mostafa Gaber',   '+20-109-111-2222', 'mostafa.gaber@gmail.com',   'Apartment', 450000, 600000, 'Facebook', 'Mohamed Ali', 'MA', 'Qualified'::public.lead_status,            '2026-08-04', '2026-08-06', 'Interested in Aton Compound, wants 3 bedrooms and a balcony', 'Minya City Center', admin_id),
    ('Heba El-Gendy',   '+20-111-333-4444', 'heba.eg@gmail.com',         'Apartment', 350000, 480000, 'WhatsApp', 'Mariam Kamel', 'MK', 'New'::public.lead_status,                       '2026-08-05', '2026-08-05', 'Fresh enquiry, prefers payment plan on installments', 'Samalut', admin_id),
    ('Ayman Shalaby',   '+20-112-555-6666', 'ayman.shalaby@icloud.com',  'Villa',     900000, 1250000, 'Referral', 'Mahmoud Ibrahim', 'MI', 'Site Visit Scheduled'::public.lead_status,  '2026-08-03', '2026-08-07', 'Referred by client, visiting Aton on Saturday morning', 'Mallawi', admin_id),
    ('Dina Mostafa',    '+20-113-777-8888', 'dina.m@yahoo.com',          'Apartment', 400000, 550000, 'Instagram','Fatma El-Sayed', 'FE', 'Contacted'::public.lead_status,              '2026-08-04', '2026-08-08', 'Wants north-facing unit, near Kornish', 'Bani Mazar', admin_id),
    ('Khaled Fathy',    '+20-115-999-0000', 'khaled.fathy@gmail.com',    'Land',      800000, 1100000, 'Property Portal', 'Omar Farouk', 'OF', 'Negotiation'::public.lead_status,      '2026-08-02', '2026-08-06', 'Negotiating a plot on Abu Fana road, asks for 8% discount', 'Abu Fana Road', admin_id),
    ('Reem Adel',       '+20-100-222-3333', 'reem.adel@gmail.com',       'Apartment', 520000, 680000, 'Walk-in', 'Salma Abdelrahman', 'SA', 'Site Visited'::public.lead_status,        '2026-08-05', '2026-08-07', 'Liked Al-Minya Garden unit 4B, considering booking', 'Kornish El-Nil Minya', admin_id),
    ('Tamer El-Sherif', '+20-101-444-5555', 'tamer.es@gmail.com',        'Shop',      300000, 420000, 'Referral', 'Mohamed Ali', 'MA', 'Won'::public.lead_status,                     '2026-08-05', '2026-08-10', 'Deal closed - shop in Mallawi Commercial Hub', 'Mallawi', admin_id),
    ('Naglaa Shaker',   '+20-102-666-7777', 'naglaa.shaker@hotmail.com', 'Apartment', 380000, 500000, 'Facebook', 'Nour Khalil', 'NK', 'Won'::public.lead_status,                     '2026-08-06', '2026-08-12', 'Closed - Tuna el-Gebel apartment, handover Dec', 'Tuna el-Gebel', admin_id),
    ('Hazem Nabil',     '+20-103-888-9999', 'hazem.nabil@gmail.com',     'Villa',     1000000, 1400000, 'WhatsApp', 'Mahmoud Ibrahim', 'MI', 'Lost'::public.lead_status,                  '2026-07-30', '2026-08-01', 'Chose another agency, hold for future', 'Samalut Hilltops', admin_id),
    ('Engy Badran',     '+20-122-111-2222', 'engy.badran@gmail.com',     'Apartment', 430000, 580000, 'Instagram','Fatma El-Sayed', 'FE', 'New'::public.lead_status,                       '2026-08-06', '2026-08-06', 'Asks about Minya New City delivery timeline', 'Minya New City', admin_id)
  ON CONFLICT DO NOTHING;

  -- ─── 7. EGYPTIAN FOLLOW-UPS ───────────────────────────────────────────────
  INSERT INTO public.follow_ups (title, contact_name, contact_type, contact_phone, contact_email, follow_up_type, follow_up_status, priority, due_date, due_time, agent, agent_initials, notes, property_interest, relationship_status, created_by) VALUES
    ('Follow up on Aton visit feedback',  'Ayman Shalaby',  'Lead'::public.contact_type,     '+20-112-555-6666', 'ayman.shalaby@icloud.com',   'Call'::public.follow_up_type,       'Pending'::public.follow_up_status,   'High'::public.follow_up_priority,   '2026-08-08', '11:00', 'Mahmoud Ibrahim', 'MI', 'Get final decision after the Aton site visit', 'Villa - Aton Compound', 'Negotiating'::public.relationship_status, admin_id),
    ('Send Samalut pricing',              'Heba El-Gendy',  'Lead'::public.contact_type,     '+20-111-333-4444', 'heba.eg@gmail.com',          'WhatsApp'::public.follow_up_type,   'Pending'::public.follow_up_status,   'Medium'::public.follow_up_priority, '2026-08-06', '14:00', 'Mariam Kamel',  'MK', 'Share unit prices and installment plan', 'Apartment - Samalut Villas', 'Nurturing'::public.relationship_status, admin_id),
    ('Rebook Mallawi site visit',         'Reem Adel',      'Lead'::public.contact_type,     '+20-100-222-3333', 'reem.adel@gmail.com',        'Site Visit'::public.follow_up_type, 'Pending'::public.follow_up_status,   'High'::public.follow_up_priority,   '2026-08-09', '12:00', 'Salma Abdelrahman','SA', 'Confirm viewing of unit 4B, bring family', 'Apartment - Al-Minya Garden', 'Nurturing'::public.relationship_status, admin_id),
    ('Handover checklist',                'Tamer El-Sherif','Customer'::public.contact_type, '+20-101-444-5555', 'tamer.es@gmail.com',         'Call'::public.follow_up_type,       'Completed'::public.follow_up_status, 'Low'::public.follow_up_priority,    '2026-08-05', '10:00', 'Mohamed Ali',    'MA', 'Shop handover completed - Mallawi Commercial Hub', 'Shop - Mallawi Commercial Hub', 'Loyal'::public.relationship_status, admin_id),
    ('Negotiate land price',              'Khaled Fathy',   'Lead'::public.contact_type,     '+20-115-999-0000', 'khaled.fathy@gmail.com',     'Meeting'::public.follow_up_type,    'Overdue'::public.follow_up_status,  'High'::public.follow_up_priority,   '2026-08-04', '09:00', 'Omar Farouk',   'OF', 'Client wants 8% discount on Abu Fana plot', 'Land - Abu Fana Road', 'At Risk'::public.relationship_status, admin_id)
  ON CONFLICT DO NOTHING;

  -- ─── 8. SAMPLE ACTIVITY LOG (tests the per-hour activity report) ─────────
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.activity_log (user_id, action_type, entity_type, entity_id, detail, meta, created_at) VALUES
      (admin_id, 'Lead Added',      'lead', 'seed-1', 'Mostafa Gaber',      '',                 NOW() - INTERVAL '7 hours'),
      (admin_id, 'Lead Added',      'lead', 'seed-2', 'Heba El-Gendy',      '',                 NOW() - INTERVAL '6 hours'),
      (admin_id, 'Lead Updated',    'lead', 'seed-2', 'Heba El-Gendy',      '',                 NOW() - INTERVAL '5 hours'),
      (admin_id, 'Comment Added',   'lead_comment', 'seed-1', 'Follow up on budget', '',        NOW() - INTERVAL '4 hours'),
      (admin_id, 'Follow-up Added', 'follow_up', 'seed-3', 'Send Samalut pricing', 'WhatsApp', NOW() - INTERVAL '3 hours'),
      (admin_id, 'Lead Updated',    'lead', 'seed-3', 'Ayman Shalaby',      '',                 NOW() - INTERVAL '2 hours'),
      (admin_id, 'Follow-up Added', 'follow_up', 'seed-6', 'Call follow-up - Tamer El-Sherif', 'Call', NOW() - INTERVAL '2 hours 35 minutes'),
      (admin_id, 'Lead Added',      'lead', 'seed-4', 'Reem Adel',          '',                 NOW() - INTERVAL '1 hour'),
      (admin_id, 'Follow-up Added', 'follow_up', 'seed-4', 'Rebook Mallawi visit', 'Site Visit', NOW() - INTERVAL '30 minutes'),
      (admin_id, 'Lead Updated',    'lead', 'seed-5', 'Tamer El-Sherif',    '',                 NOW() - INTERVAL '10 minutes');
  END IF;

END $$;