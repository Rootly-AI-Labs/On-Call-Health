-- Remove communication_patterns_enabled column from slack_workspace_mappings
-- This feature is now controlled per-analysis instead of workspace-level

ALTER TABLE slack_workspace_mappings
DROP COLUMN IF EXISTS communication_patterns_enabled;
