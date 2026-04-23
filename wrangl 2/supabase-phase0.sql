-- ============================================================
-- Berkely Wrangl — Phase 0 Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Users (extends Supabase auth.users)
CREATE TABLE users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text UNIQUE NOT NULL,
  full_name   text,
  role        text NOT NULL DEFAULT 'viewer'
                   CHECK (role IN ('admin','sales','ops','purchasing','viewer')),
  team        text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'viewer'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read all profiles
CREATE POLICY "users_select" ON users
  FOR SELECT TO authenticated USING (true);

-- Users can update their own profile
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "users_admin_all" ON users
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- Seed your own user as admin after signing up
-- Replace the email below with yours, then run this
-- ============================================================

-- UPDATE users SET role = 'admin' WHERE email = 'david@berkelydistribution.com';
