-- Migration: Add pagerduty_teams column to user_correlations table
-- Description: Stores PagerDuty team memberships (array of {id, name}) for each synced user.
--              Used to scope analytics API queries to specific teams and to display team info in UI.

ALTER TABLE user_correlations ADD COLUMN IF NOT EXISTS pagerduty_teams JSONB;

COMMENT ON COLUMN user_correlations.pagerduty_teams IS 'Array of PagerDuty team objects [{id, name}] this user belongs to, populated during sync';
