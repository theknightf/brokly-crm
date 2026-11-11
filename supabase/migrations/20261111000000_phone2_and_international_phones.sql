-- A second phone number per lead, and international numbers handled by the shared normalizer.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone2 text;

-- Digits only; a leading "00" (international dialling prefix) is the same as "+": "00971 50…" = "+971 50…".
-- Egypt keeps its old behaviour: drop the 20 country code (12+ digits) and one leading 0, so
-- "+20 100 123 4567", "0020 100 123 4567" and "0100 123 4567" all become "1001234567".
-- Must stay identical to normalizePhone() in src/lib/phone.ts.
CREATE OR REPLACE FUNCTION public.normalize_phone(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  d text := regexp_replace(COALESCE(raw, ''), '\D', '', 'g');
BEGIN
  IF d = '' THEN RETURN ''; END IF;
  IF left(d, 2) = '00' AND length(d) > 2 THEN
    d := substr(d, 3);
  END IF;
  IF left(d, 2) = '20' AND length(d) >= 12 THEN
    d := substr(d, 3);
  END IF;
  IF left(d, 1) = '0' THEN
    d := substr(d, 2);
  END IF;
  RETURN d;
END;
$$;
