-- Migration 024: Add survey frequency columns to Railway database
-- Run this SQL directly in Railway PostgreSQL dashboard

-- Add send_reminder column if missing
ALTER TABLE survey_schedules
ADD COLUMN IF NOT EXISTS send_reminder BOOLEAN DEFAULT TRUE;

-- Add reminder_time column if missing
ALTER TABLE survey_schedules
ADD COLUMN IF NOT EXISTS reminder_time TIME;

-- Add reminder_hours_after column if missing
ALTER TABLE survey_schedules
ADD COLUMN IF NOT EXISTS reminder_hours_after INTEGER DEFAULT 5;

-- Add message_template column if missing
ALTER TABLE survey_schedules
ADD COLUMN IF NOT EXISTS message_template VARCHAR(500);

-- Add reminder_message_template column if missing
ALTER TABLE survey_schedules
ADD COLUMN IF NOT EXISTS reminder_message_template VARCHAR(500);

-- Update defaults for message templates
UPDATE survey_schedules
SET message_template = 'Hi there! 👋\n\nQuick check-in: How are you doing today?\n\nYour feedback helps us support team health and prevent burnout.'
WHERE message_template IS NULL;

UPDATE survey_schedules
SET reminder_message_template = 'Quick reminder 🔔\n\nHaven''t heard from you yet today. Take 2 minutes to check in?\n\nYour wellbeing matters to us.'
WHERE reminder_message_template IS NULL;

-- Add frequency_type column
ALTER TABLE survey_schedules
ADD COLUMN IF NOT EXISTS frequency_type VARCHAR(20) DEFAULT 'weekday';

-- Add day_of_week column
ALTER TABLE survey_schedules
ADD COLUMN IF NOT EXISTS day_of_week INTEGER;

-- Add check constraint for frequency_type (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_frequency_type'
    ) THEN
        ALTER TABLE survey_schedules
        ADD CONSTRAINT check_frequency_type
        CHECK (frequency_type IN ('daily', 'weekday', 'weekly'));
    END IF;
END $$;

-- Add check constraint for day_of_week (if not already present)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_day_of_week'
    ) THEN
        ALTER TABLE survey_schedules
        ADD CONSTRAINT check_day_of_week
        CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6));
    END IF;
END $$;

-- Mark migration as applied
INSERT INTO migrations (name, status, applied_at)
VALUES ('024_add_survey_frequency_options', 'completed', CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET
    applied_at = CURRENT_TIMESTAMP,
    status = 'completed';
