-- Add computed column for PostgREST to quickly check if a lead has logged calls
-- without transferring large ID lists over URL query strings.
CREATE OR REPLACE FUNCTION has_call(l leads) 
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM call_logs c
    WHERE c.entity_type = 'lead'
      AND c.entity_id = l.id::text
  );
$$;
