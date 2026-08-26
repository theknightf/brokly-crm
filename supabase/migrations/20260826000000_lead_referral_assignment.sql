-- Allow a lead to be shared with a second user while preserving referral credit.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS referred_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_referred_to ON public.leads(referred_to);
CREATE INDEX IF NOT EXISTS idx_leads_referred_by ON public.leads(referred_by);

DROP POLICY IF EXISTS "leads_referral_recipient_select" ON public.leads;
CREATE POLICY "leads_referral_recipient_select"
ON public.leads FOR SELECT TO authenticated
USING (referred_to = auth.uid() OR referred_by = auth.uid());

DROP POLICY IF EXISTS "leads_referral_recipient_update" ON public.leads;
CREATE POLICY "leads_referral_recipient_update"
ON public.leads FOR UPDATE TO authenticated
USING (referred_to = auth.uid() OR referred_by = auth.uid())
WITH CHECK (true);
