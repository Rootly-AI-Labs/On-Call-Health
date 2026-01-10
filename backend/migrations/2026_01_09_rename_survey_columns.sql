-- Rename user_burnout_reports columns to match current code expectations
-- Old schema: self_reported_score, energy_level
-- New schema: feeling_score, workload_score

-- Rename columns
ALTER TABLE user_burnout_reports
  RENAME COLUMN self_reported_score TO workload_score;

ALTER TABLE user_burnout_reports
  RENAME COLUMN energy_level TO feeling_score;

-- Update constraints
ALTER TABLE user_burnout_reports
  DROP CONSTRAINT IF EXISTS user_burnout_reports_self_reported_score_check;

ALTER TABLE user_burnout_reports
  DROP CONSTRAINT IF EXISTS user_burnout_reports_energy_level_check;

ALTER TABLE user_burnout_reports
  ADD CONSTRAINT user_burnout_reports_feeling_score_check
  CHECK (feeling_score >= 1 AND feeling_score <= 5);

ALTER TABLE user_burnout_reports
  ADD CONSTRAINT user_burnout_reports_workload_score_check
  CHECK (workload_score >= 1 AND workload_score <= 5);
