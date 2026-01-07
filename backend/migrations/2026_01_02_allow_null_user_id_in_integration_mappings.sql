-- Migration: Allow NULL user_id in integration_mappings for org-scoped users
-- Date: 2026-01-02
-- Issue: Analyses only create mappings for users with user_id set, excluding org-scoped team roster
-- Fix: Make user_id nullable to allow mappings for organization-wide users (user_id=NULL)

-- Step 1: Make user_id nullable
ALTER TABLE integration_mappings
ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Add organization_id column for multi-tenancy support
ALTER TABLE integration_mappings
ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);

-- Step 3: Backfill organization_id from users table for existing records
UPDATE integration_mappings im
SET organization_id = u.organization_id
FROM users u
WHERE im.user_id = u.id
  AND im.organization_id IS NULL;

-- Step 4: Add composite index for efficient org-scoped lookups
CREATE INDEX IF NOT EXISTS idx_integration_mappings_org_analysis
ON integration_mappings(organization_id, analysis_id)
WHERE organization_id IS NOT NULL;

-- Step 5: Add index for source_identifier lookups (email-based matching)
CREATE INDEX IF NOT EXISTS idx_integration_mappings_source_identifier
ON integration_mappings(source_identifier, source_platform, analysis_id);

-- Verification queries (run these manually to check the migration)
-- SELECT COUNT(*) as before_count FROM integration_mappings WHERE user_id IS NOT NULL;
-- SELECT COUNT(*) as nullable_check FROM information_schema.columns
--   WHERE table_name = 'integration_mappings' AND column_name = 'user_id' AND is_nullable = 'YES';
