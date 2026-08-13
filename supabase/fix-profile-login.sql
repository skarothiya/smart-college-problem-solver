-- =============================================================================
-- Fix: "Could not load your profile" on student login
-- Run ALL of this in Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- 1. RLS: user can always read own profile
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_student()
    OR public.is_admin()
  );

-- 2. Signup trigger (creates profile when auth user is created)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'student'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. RPC: create/load student profile on login (bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.ensure_my_student_profile(
  p_full_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RETURN QUERY SELECT * FROM public.profiles WHERE id = v_uid;
    RETURN;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  v_email := COALESCE(NULLIF(trim(p_email), ''), v_email);
  v_name := COALESCE(
    NULLIF(trim(p_full_name), ''),
    split_part(COALESCE(v_email, 'student@local'), '@', 1),
    'Student'
  );

  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (v_uid, v_name, v_email, 'student');

  RETURN QUERY SELECT * FROM public.profiles WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_student_profile(TEXT, TEXT) TO authenticated;

-- 4. Backfill missing profiles for users already registered
INSERT INTO public.profiles (id, full_name, email, role)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  u.email,
  'student'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;
