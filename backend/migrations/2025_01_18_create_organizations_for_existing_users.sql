-- Migration: Create organizations for existing users
-- Date: 2025-01-18
-- Purpose:
--   1. Create Rootly organization for @rootly.com users
--   2. Create organizations for any other existing users by domain
--   3. Assign users to their respective organizations

-- Step 1: Create Rootly organization
INSERT INTO organizations (name, domain, slug, status, created_at, updated_at)
VALUES ('Rootly', 'rootly.com', 'rootly', 'active', NOW(), NOW())
ON CONFLICT (domain) DO NOTHING
RETURNING id, name, domain;

-- Step 2: Auto-create organizations for all other domains
-- This finds all unique email domains (excluding shared domains) and creates orgs
WITH unique_domains AS (
    SELECT DISTINCT
        SPLIT_PART(email, '@', 2) as domain,
        INITCAP(SPLIT_PART(SPLIT_PART(email, '@', 2), '.', 1)) as org_name
    FROM users
    WHERE email IS NOT NULL
      AND email LIKE '%@%'
      -- Exclude shared email domains
      AND SPLIT_PART(email, '@', 2) NOT IN ('gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'hey.com')
      -- Exclude users who already have an organization
      AND NOT EXISTS (
          SELECT 1 FROM organizations
          WHERE domain = SPLIT_PART(users.email, '@', 2)
      )
)
INSERT INTO organizations (name, domain, slug, status, created_at, updated_at)
SELECT
    org_name,
    domain,
    REPLACE(domain, '.', '-') as slug,
    'active',
    NOW(),
    NOW()
FROM unique_domains
ON CONFLICT (domain) DO NOTHING;

-- Step 3: Assign users to organizations based on email domain
WITH user_org_assignments AS (
    SELECT
        u.id as user_id,
        o.id as org_id,
        SPLIT_PART(u.email, '@', 2) as user_domain,
        -- Count existing users in the organization to determine role
        (SELECT COUNT(*) FROM users WHERE organization_id = o.id AND status = 'active') as existing_users_count
    FROM users u
    JOIN organizations o ON o.domain = SPLIT_PART(u.email, '@', 2)
    WHERE u.organization_id IS NULL
      AND u.email IS NOT NULL
      AND u.email LIKE '%@%'
      -- Exclude shared domains (they need invitations)
      AND SPLIT_PART(u.email, '@', 2) NOT IN ('gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'hey.com')
)
UPDATE users
SET
    organization_id = user_org_assignments.org_id,
    -- First user becomes admin, rest become members
    role = CASE
        WHEN user_org_assignments.existing_users_count = 0 THEN 'admin'
        ELSE COALESCE(users.role, 'member')
    END,
    joined_org_at = COALESCE(users.joined_org_at, NOW())
FROM user_org_assignments
WHERE users.id = user_org_assignments.user_id;

-- Step 4: Update Slack workspace mappings to link to organizations
-- This finds workspaces owned by users who now have an organization_id
-- and assigns the workspace to that organization
UPDATE slack_workspace_mappings swm
SET organization_id = u.organization_id
FROM users u
WHERE swm.owner_user_id = u.id
  AND swm.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- Step 5: Verify results
SELECT
    'Organizations Created' as step,
    COUNT(*) as count
FROM organizations
UNION ALL
SELECT
    'Users Assigned to Orgs' as step,
    COUNT(*) as count
FROM users
WHERE organization_id IS NOT NULL
UNION ALL
SELECT
    'Workspaces Linked to Orgs' as step,
    COUNT(*) as count
FROM slack_workspace_mappings
WHERE organization_id IS NOT NULL
UNION ALL
SELECT
    'Admins Created' as step,
    COUNT(*) as count
FROM users
WHERE role = 'admin'
UNION ALL
SELECT
    'Users Without Org (Should be 0 or shared domains only)' as step,
    COUNT(*) as count
FROM users
WHERE organization_id IS NULL
  AND email NOT LIKE '%gmail.com%'
  AND email NOT LIKE '%yahoo.com%'
  AND email NOT LIKE '%hotmail.com%'
  AND email NOT LIKE '%outlook.com%'
  AND email NOT LIKE '%icloud.com%';
