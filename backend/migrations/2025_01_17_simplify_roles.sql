-- Migration: Simplify role system from 5 roles to 3 roles
-- Date: 2025-01-17
-- Description: Standardize org_admin → admin, manager/user → member

-- Step 1: Update existing users table roles
UPDATE users
SET role = 'admin'
WHERE role IN ('org_admin', 'super_admin');

UPDATE users
SET role = 'member'
WHERE role IN ('manager', 'user');

-- Step 2: Update organization_invitations table roles
UPDATE organization_invitations
SET role = 'admin'
WHERE role = 'org_admin';

UPDATE organization_invitations
SET role = 'member'
WHERE role IN ('manager', 'user');

-- Step 3: Update users table constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'member', 'viewer'));

-- Step 4: Update default role for new users
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';

-- Step 5: Update organization_invitations constraints
ALTER TABLE organization_invitations DROP CONSTRAINT IF EXISTS invitation_role_check;
ALTER TABLE organization_invitations ADD CONSTRAINT invitation_role_check
  CHECK (role IN ('admin', 'member', 'viewer'));

-- Verify the migration
SELECT 'Users role distribution:' as info;
SELECT role, COUNT(*) as count
FROM users
GROUP BY role
ORDER BY count DESC;

SELECT 'Invitations role distribution:' as info;
SELECT role, COUNT(*) as count
FROM organization_invitations
GROUP BY role
ORDER BY count DESC;
