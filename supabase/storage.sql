-- =============================================================================
-- Smart College Problem Solver — Supabase Storage (complaint images)
-- =============================================================================
-- Run in Supabase Dashboard → SQL Editor after schema.sql
-- Bucket: complaint-images (private — access via Storage RLS + signed URLs)
-- Path:   {user_id}/{unique-filename}.{ext}
-- =============================================================================

-- Private bucket (not public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'complaint-images',
  'complaint-images',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- ---------- storage.objects policies ----------

DROP POLICY IF EXISTS "complaint_images_insert_own" ON storage.objects;
CREATE POLICY "complaint_images_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'complaint-images'
    AND public.is_student()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "complaint_images_select_authenticated" ON storage.objects;
CREATE POLICY "complaint_images_select_authenticated"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'complaint-images'
    AND (public.is_student() OR public.is_admin())
  );

DROP POLICY IF EXISTS "complaint_images_delete_own" ON storage.objects;
CREATE POLICY "complaint_images_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'complaint-images'
    AND public.is_student()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Students cannot UPDATE or DELETE another user's objects.
-- Admins view images via SELECT policy; no admin upload/delete required.
