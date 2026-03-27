-- ============================================================================
-- 012: Storage bucket setup with RLS policies
-- Creates three buckets: splat-files (private), thumbnails (public), assets (private)
-- RLS policies mirror database table access patterns
-- ============================================================================

-- Create buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('splat-files', 'splat-files', false, 524288000, NULL),  -- 500MB limit, any mime type (binary splat files)
  ('thumbnails', 'thumbnails', true, 10485760, ARRAY['image/webp', 'image/jpeg', 'image/png']),  -- 10MB limit, images only
  ('assets', 'assets', false, 52428800, NULL)  -- 50MB limit
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- splat-files bucket policies
-- Private bucket. RLS mirrors tour visibility:
--   - Org members (viewer+) can read splat files for their org's tours
--   - Published tour splat files are publicly readable (no JWT needed)
--   - Editors+ can upload/update splat files for their org
--   - Admins+ can delete splat files
-- Path convention: {org_id}/{tour_id}/{scene_id}/scene.{ext}
-- ============================================================================

-- SELECT: org members can read their org's splat files
CREATE POLICY "splat_files_select_org_member"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'splat-files'
  AND (
    -- Org members can read files in their org's folder
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
        AND org_members.user_id = auth.uid()
    )
    -- Published tours' splat files are publicly readable
    OR EXISTS (
      SELECT 1 FROM public.scenes s
      JOIN public.tours t ON t.id = s.tour_id
      WHERE t.org_id = (storage.foldername(name))[1]::uuid
        AND t.id = (storage.foldername(name))[2]::uuid
        AND s.id = (storage.foldername(name))[3]::uuid
        AND t.status = 'published'
    )
  )
);

-- INSERT: editors+ can upload splat files for their org
CREATE POLICY "splat_files_insert_editor"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'splat-files'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin', 'editor')
  )
);

-- UPDATE: editors+ can update splat files for their org
CREATE POLICY "splat_files_update_editor"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'splat-files'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin', 'editor')
  )
);

-- DELETE: admins+ can delete splat files
CREATE POLICY "splat_files_delete_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'splat-files'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
  )
);

-- ============================================================================
-- thumbnails bucket policies
-- Public bucket (CDN). Anyone can read. Upload/delete restricted to org members.
-- Path convention: {org_id}/{tour_id}/{scene_id}/thumbnail.webp
-- ============================================================================

-- SELECT: public read (bucket is public, but policy still needed for authenticated access)
CREATE POLICY "thumbnails_select_public"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'thumbnails'
);

-- INSERT: editors+ can upload thumbnails for their org
CREATE POLICY "thumbnails_insert_editor"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'thumbnails'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin', 'editor')
  )
);

-- UPDATE: editors+ can update thumbnails for their org
CREATE POLICY "thumbnails_update_editor"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'thumbnails'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin', 'editor')
  )
);

-- DELETE: admins+ can delete thumbnails
CREATE POLICY "thumbnails_delete_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'thumbnails'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
  )
);

-- ============================================================================
-- assets bucket policies
-- Private bucket. Org-scoped RLS for floor plans and other assets.
-- Path convention: {org_id}/{type}/{filename}
-- ============================================================================

-- SELECT: org members can read their org's assets
CREATE POLICY "assets_select_org_member"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'assets'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
  )
);

-- INSERT: editors+ can upload assets for their org
CREATE POLICY "assets_insert_editor"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'assets'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin', 'editor')
  )
);

-- UPDATE: editors+ can update assets for their org
CREATE POLICY "assets_update_editor"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'assets'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin', 'editor')
  )
);

-- DELETE: admins+ can delete assets
CREATE POLICY "assets_delete_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'assets'
  AND EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = (storage.foldername(name))[1]::uuid
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
  )
);
