-- International phone numbers: store them as "+<country code><number>" (like the app does for numbers typed with a "+").
-- About 200 leads were saved as plain digits (966500318426, 971507769714, 96598933880 ...), which the dialer and the
-- WhatsApp link treat as local/Egyptian numbers. A number is changed only when ALL of these hold:
--   * it is plain digits (spaces / dashes / brackets allowed; no "+", no letters),
--   * it does not start with 0 (local format) and is not Egyptian (starts with 20, or the 10-digit 1[0125]xxxxxxxx form),
--   * its first 1-3 digits are a real country calling code (the list below) and it is 9-15 digits long
--     (country code "1" must be exactly 11 digits).
-- Nothing else is touched. Also applied to follow_ups.contact_phone, which keeps a copy of the lead's number.
--
-- Side effects avoided: triggers are skipped for the update (no activity log / "last action" / updated_at changes),
-- and normalize_phone() gives the same result with or without the "+", so duplicate detection is unaffected.
-- Every changed value is saved in backup.phone_intl_fix_20261117 so it can be reverted:
--   UPDATE public.leads l SET phone = b.old_phone FROM backup.phone_intl_fix_20261117 b WHERE b.tbl = 'leads' AND b.id = l.id::text;
--   UPDATE public.follow_ups f SET contact_phone = b.old_phone FROM backup.phone_intl_fix_20261117 b WHERE b.tbl = 'follow_ups' AND b.id = f.id::text;

CREATE TABLE IF NOT EXISTS backup.phone_intl_fix_20261117 (
  tbl text NOT NULL,
  id text NOT NULL,
  old_phone text,
  new_phone text,
  fixed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tbl, id)
);

SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE _intl_codes (cc text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _intl_codes (cc) VALUES
 ('1'),('7'),('27'),('30'),('31'),('32'),('33'),('34'),('36'),('39'),('40'),('41'),('43'),('44'),('45'),('46'),('47'),('48'),('49'),
 ('51'),('52'),('53'),('54'),('55'),('56'),('57'),('58'),('60'),('61'),('62'),('63'),('64'),('65'),('66'),('81'),('82'),('84'),('86'),
 ('90'),('91'),('92'),('93'),('94'),('95'),('98'),
 ('211'),('212'),('213'),('216'),('218'),('220'),('221'),('222'),('223'),('224'),('225'),('226'),('227'),('228'),('229'),('230'),('231'),
 ('232'),('233'),('234'),('235'),('236'),('237'),('238'),('239'),('240'),('241'),('242'),('243'),('244'),('245'),('246'),('247'),('248'),
 ('249'),('250'),('251'),('252'),('253'),('254'),('255'),('256'),('257'),('258'),('260'),('261'),('262'),('263'),('264'),('265'),('266'),
 ('267'),('268'),('269'),('290'),('291'),('297'),('298'),('299'),
 ('350'),('351'),('352'),('353'),('354'),('355'),('356'),('357'),('358'),('359'),('370'),('371'),('372'),('373'),('374'),('375'),('376'),
 ('377'),('378'),('380'),('381'),('382'),('383'),('385'),('386'),('387'),('389'),('420'),('421'),('423'),
 ('500'),('501'),('502'),('503'),('504'),('505'),('506'),('507'),('508'),('509'),('590'),('591'),('592'),('593'),('594'),('595'),('596'),
 ('597'),('598'),('599'),
 ('670'),('672'),('673'),('674'),('675'),('676'),('677'),('678'),('679'),('680'),('681'),('682'),('683'),('685'),('686'),('687'),('688'),
 ('689'),('690'),('691'),('692'),
 ('850'),('852'),('853'),('855'),('856'),('880'),('886'),
 ('960'),('961'),('962'),('963'),('964'),('965'),('966'),('967'),('968'),('970'),('971'),('972'),('973'),('974'),('975'),('976'),('977'),
 ('992'),('993'),('994'),('995'),('996'),('998');

-- Leads that qualify, with the digits to store.
CREATE TEMP TABLE _intl_fix ON COMMIT DROP AS
SELECT l.id, regexp_replace(l.phone, '\D', '', 'g') AS d
FROM public.leads l
WHERE l.phone ~ '^[0-9 ()\-]+$'
  AND regexp_replace(l.phone, '\D', '', 'g') !~ '^0'
  AND regexp_replace(l.phone, '\D', '', 'g') !~ '^20'
  AND regexp_replace(l.phone, '\D', '', 'g') !~ '^1[0125]\d{8}$'
  AND length(regexp_replace(l.phone, '\D', '', 'g')) BETWEEN 9 AND 15
  AND EXISTS (
    SELECT 1 FROM _intl_codes c
    WHERE regexp_replace(l.phone, '\D', '', 'g') LIKE c.cc || '%'
      AND (c.cc <> '1' OR length(regexp_replace(l.phone, '\D', '', 'g')) = 11)
      AND (c.cc <> '7' OR length(regexp_replace(l.phone, '\D', '', 'g')) = 11)
  );

-- leads
INSERT INTO backup.phone_intl_fix_20261117 (tbl, id, old_phone, new_phone)
SELECT 'leads', l.id::text, l.phone, '+' || f.d FROM public.leads l JOIN _intl_fix f ON f.id = l.id
ON CONFLICT (tbl, id) DO NOTHING;

UPDATE public.leads l SET phone = '+' || f.d FROM _intl_fix f WHERE l.id = f.id;

-- follow-ups that hold a copy of one of those numbers
INSERT INTO backup.phone_intl_fix_20261117 (tbl, id, old_phone, new_phone)
SELECT 'follow_ups', fu.id::text, fu.contact_phone, '+' || f.d
FROM public.follow_ups fu JOIN _intl_fix f ON f.id = fu.lead_id
WHERE regexp_replace(coalesce(fu.contact_phone, ''), '\D', '', 'g') = f.d AND fu.contact_phone !~ '^\+'
ON CONFLICT (tbl, id) DO NOTHING;

UPDATE public.follow_ups fu SET contact_phone = '+' || f.d
FROM _intl_fix f
WHERE fu.lead_id = f.id AND regexp_replace(coalesce(fu.contact_phone, ''), '\D', '', 'g') = f.d AND fu.contact_phone !~ '^\+';

RESET session_replication_role;
