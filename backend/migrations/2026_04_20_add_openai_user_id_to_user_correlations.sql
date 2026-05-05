-- Migration: Add OpenAI user ID to user_correlations
-- Date: 2026-04-20
-- Description: Stores the OpenAI opaque user_id per team member for per-user token usage tracking

ALTER TABLE user_correlations ADD COLUMN IF NOT EXISTS openai_user_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS ix_user_correlations_openai_user_id ON user_correlations(openai_user_id);
