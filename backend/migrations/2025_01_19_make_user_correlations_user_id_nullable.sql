-- Migration: Make user_correlations.user_id nullable
-- Purpose: Allow org-scoped team roster data without requiring user_id
-- This fixes the root cause of user correlation data corruption

-- Make user_id nullable
ALTER TABLE user_correlations
ALTER COLUMN user_id DROP NOT NULL;

-- Add comment explaining the data model
COMMENT ON COLUMN user_correlations.user_id IS
'User ID for personal correlations (when this data belongs to a specific logged-in user).
NULL for organization-scoped team roster data (imported from integrations like Rootly/PagerDuty).';

-- Create index for org-scoped queries (where user_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_user_correlations_org_email
ON user_correlations(organization_id, email)
WHERE user_id IS NULL;

-- Add partial unique constraint for org-scoped records
-- This prevents duplicate team member entries in the same organization
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_correlations_org_email
ON user_correlations(organization_id, email)
WHERE user_id IS NULL;

COMMENT ON INDEX uq_user_correlations_org_email IS
'Ensures each email appears only once per organization for org-scoped roster data';
