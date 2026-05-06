-- Migration: Add AI Usage Integrations table
-- Date: 2026-03-31
-- Description: Stores OpenAI and Anthropic API keys (encrypted) per organization for AI coding assistant usage tracking

CREATE TABLE IF NOT EXISTS ai_usage_integrations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- OpenAI
    openai_api_key TEXT,
    openai_org_id VARCHAR(200),
    openai_enabled BOOLEAN DEFAULT FALSE,

    -- Anthropic
    anthropic_api_key TEXT,
    anthropic_workspace_id VARCHAR(200),
    anthropic_enabled BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ai_usage_integrations_organization_id ON ai_usage_integrations(organization_id);
CREATE INDEX IF NOT EXISTS ix_ai_usage_integrations_user_id ON ai_usage_integrations(user_id);

-- Only one integration record per organization
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_usage_integrations_org ON ai_usage_integrations(organization_id);
