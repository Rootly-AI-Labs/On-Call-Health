-- Migration: Convert legacy 'user' role to 'member'
-- Date: 2025-01-30
-- Description: Standardize roles to only 'admin' and 'member'

BEGIN;

-- Update all 'user' roles to 'member'
UPDATE users
SET role = 'member'
WHERE role = 'user';

-- Verify the change
SELECT role, COUNT(*) as count
FROM users
GROUP BY role
ORDER BY count DESC;

COMMIT;
