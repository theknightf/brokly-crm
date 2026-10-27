-- Create dedicated private storage bucket for imported Excel/CSV sheets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-imports',
  'lead-imports',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create public.import_logs table
CREATE TABLE IF NOT EXISTS public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_file_name text NOT NULL,
  file_size_bytes integer NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  storage_bucket text NOT NULL DEFAULT 'lead-imports',
  storage_path text,
  file_base64 text,
  uploaded_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  uploaded_by_name text,
  uploaded_by_role text,
  status text NOT NULL DEFAULT 'Completed' CHECK (status IN ('Processing', 'Completed', 'Partially Imported', 'Failed')),
  source_name text,
  target_stage text,
  assignment_mode text,
  total_rows integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  routed_duplicates_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  summary text,
  error_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_logs_created_at
  ON public.import_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_uploaded_by
  ON public.import_logs (uploaded_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_status
  ON public.import_logs (status, created_at DESC);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lead_imports_insert_authenticated'
  ) THEN
    CREATE POLICY "lead_imports_insert_authenticated"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'lead-imports');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lead_imports_select_authorized'
  ) THEN
    CREATE POLICY "lead_imports_select_authorized"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'lead-imports'
        AND EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.id = auth.uid()
            AND lower(COALESCE(up.role::text, '')) IN ('owner', 'admin', 'owner_admin', 'branch_manager', 'team_leader')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'import_logs' AND policyname = 'import_logs_select_authorized'
  ) THEN
    CREATE POLICY "import_logs_select_authorized"
      ON public.import_logs FOR SELECT
      TO authenticated
      USING (
        uploaded_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.id = auth.uid()
            AND lower(COALESCE(up.role::text, '')) IN ('owner', 'admin', 'owner_admin', 'branch_manager', 'team_leader')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'import_logs' AND policyname = 'import_logs_insert_authenticated'
  ) THEN
    CREATE POLICY "import_logs_insert_authenticated"
      ON public.import_logs FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'import_logs' AND policyname = 'import_logs_update_authenticated'
  ) THEN
    CREATE POLICY "import_logs_update_authenticated"
      ON public.import_logs FOR UPDATE
      TO authenticated
      USING (
        uploaded_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_profiles up
          WHERE up.id = auth.uid()
            AND lower(COALESCE(up.role::text, '')) IN ('owner', 'admin', 'owner_admin', 'branch_manager', 'team_leader')
        )
      );
  END IF;
END $$;
