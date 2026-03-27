-- Add onboarding_completed flag to profiles
-- Used to track whether a user has completed the first-time onboarding wizard
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
