-- 011: Auto-create personal org on signup
-- When a user signs up, automatically create a profile, a personal organization,
-- and an org_members row with role 'owner'.
-- Slug generation: trim → lowercase → non-alphanumeric to hyphens → deduplicate with sequential -2, -3.

CREATE OR REPLACE FUNCTION generate_unique_slug(base_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  candidate text;
  counter integer := 2;
BEGIN
  -- trim → lowercase → replace non-alphanumeric with hyphens → collapse multiple hyphens → trim hyphens
  base_slug := trim(both '-' from regexp_replace(
    regexp_replace(lower(trim(base_name)), '[^a-z0-9]+', '-', 'g'),
    '-{2,}', '-', 'g'
  ));

  -- Fallback if slug is empty
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'user';
  END IF;

  candidate := base_slug;

  -- Deduplicate with sequential suffixes (-2, -3, ...)
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = candidate) LOOP
    candidate := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  display text;
  org_slug text;
  new_org_id uuid;
BEGIN
  -- Extract display_name from user metadata, fallback to email prefix
  display := COALESCE(
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create profile
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    generate_unique_slug(display),
    display
  );

  -- Generate unique org slug
  org_slug := generate_unique_slug(display);

  -- Create personal organization
  INSERT INTO organizations (id, name, slug)
  VALUES (gen_random_uuid(), display || '''s Space', org_slug)
  RETURNING id INTO new_org_id;

  -- Add user as owner
  INSERT INTO org_members (org_id, user_id, role, joined_at)
  VALUES (new_org_id, NEW.id, 'owner', now());

  RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
