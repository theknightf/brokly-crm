-- ============================================================
-- Brokly CRM - Arabic Trigram Notes Search & Assistant Audit Logs
-- Migration: 20261013180000_assistant_and_arabic_notes_search.sql
-- ============================================================

-- ─── 1. EXTENSIONS (pg_trgm + unaccent) ──────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ─── 2. ARABIC NORMALIZATION FUNCTION ───────────────────────
-- Normalizes text for Egyptian Arabic search:
-- 1. Lowercase English characters
-- 2. Strip Arabic harakat/tashkeel (Fat-ha, Damma, Kasra, Sukun, Shadda, Tanween, Tatweel)
-- 3. Normalize Alef variants (أ / إ / آ / ٱ -> ا)
-- 4. Normalize Taa Marbuta (ة -> ه)
-- 5. Normalize Yaa / Alef Maksura (ى -> ي)
-- 6. Strip leading definite article 'ال' from words
CREATE OR REPLACE FUNCTION public.normalize_arabic_text(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF input_text IS NULL OR input_text = '' THEN
    RETURN '';
  END IF;

  -- 1. Lowercase + trim
  cleaned := lower(trim(input_text));

  -- 2. Remove Arabic diacritics / tashkeel (\u064B to \u065F) & Tatweel (\u0640)
  cleaned := regexp_replace(cleaned, '[\u064B-\u065F\u0640]', '', 'g');

  -- 3. Normalize Alef variants
  cleaned := regexp_replace(cleaned, '[أإآٱ]', 'ا', 'g');

  -- 4. Normalize Taa Marbuta (ة -> ه)
  cleaned := regexp_replace(cleaned, 'ة', 'ه', 'g');

  -- 5. Normalize Alef Maksura (ى -> ي)
  cleaned := regexp_replace(cleaned, 'ى', 'ي', 'g');

  -- 6. Strip leading 'ال' at the beginning of words (boundaries: start of string or after whitespace)
  cleaned := regexp_replace(cleaned, '(^|\s+)ال([^\s]{2,})', '\1\2', 'g');

  -- 7. Collapse multiple spaces
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');

  RETURN trim(cleaned);
END;
$$;

-- ─── 3. NORMALIZED COLUMNS ON NOTES & LEADS ─────────────────

-- Add normalized column on public.leads for lead notes + fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS notes_normalized TEXT GENERATED ALWAYS AS (public.normalize_arabic_text(notes)) STORED;

-- Add normalized column on public.lead_comments
ALTER TABLE public.lead_comments
  ADD COLUMN IF NOT EXISTS body_normalized TEXT GENERATED ALWAYS AS (public.normalize_arabic_text(body)) STORED;

-- ─── 4. GIN TRIGRAM INDEXES ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_notes_normalized_trgm 
  ON public.leads USING gin (notes_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lead_comments_body_normalized_trgm 
  ON public.lead_comments USING gin (body_normalized gin_trgm_ops);

-- Also add trigram indexes on name and location for fast combined search
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm 
  ON public.leads USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_location_trgm 
  ON public.leads USING gin (location gin_trgm_ops);

-- ─── 5. ASSISTANT AUDIT LOGS TABLE ──────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_args JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'executed', -- 'executed' | 'pending_confirmation' | 'confirmed' | 'cancelled' | 'error'
  result_summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assistant_logs_user_id ON public.assistant_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_logs_created_at ON public.assistant_logs(created_at DESC);

ALTER TABLE public.assistant_logs ENABLE ROW LEVEL SECURITY;

-- Each user sees ONLY their own assistant logs
DROP POLICY IF EXISTS "assistant_logs_user_select" ON public.assistant_logs;
CREATE POLICY "assistant_logs_user_select"
  ON public.assistant_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Each user inserts ONLY their own assistant logs
DROP POLICY IF EXISTS "assistant_logs_user_insert" ON public.assistant_logs;
CREATE POLICY "assistant_logs_user_insert"
  ON public.assistant_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
