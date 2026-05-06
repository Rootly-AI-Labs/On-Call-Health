-- Migration: Make organization_id nullable on ai_usage_integrations
-- Date: 2026-04-20
-- Description: Allow users without an organization to connect AI usage integrations

-- Drop the NOT NULL constraint and old unique index
ALTER TABLE ai_usage_integrations ALTER COLUMN organization_id DROP NOT NULL;
DROP INDEX IF EXISTS uq_ai_usage_integrations_org;

-- Partial unique indexes:
--   - one per org when org is set
--   - one per user when no org
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_usage_integrations_org
    ON ai_usage_integrations(organization_id)
    WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_usage_integrations_user_no_org
    ON ai_usage_integrations(user_id)
    WHERE organization_id IS NULL;
