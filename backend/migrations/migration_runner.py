#!/usr/bin/env python3
"""
Migration Runner for Rootly Burnout Detector

This system automatically manages database migrations in order.
Each migration is tracked in a migrations table to avoid re-running.
"""

import sys
import os
import logging
from datetime import datetime
from typing import List, Dict

# Add the correct paths for Docker environment
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
app_dir = os.path.join(backend_dir, 'app')

# Add both backend and app directories to Python path
sys.path.insert(0, backend_dir)
sys.path.insert(0, app_dir)

try:
    from app.models import get_db
    from sqlalchemy import text, create_engine
    from sqlalchemy.exc import SQLAlchemyError
except ImportError as e:
    # Fallback for Docker environment
    sys.path.insert(0, '/app')
    sys.path.insert(0, '/app/app')
    from app.models import get_db
    from sqlalchemy import text, create_engine
    from sqlalchemy.exc import SQLAlchemyError

# Configure logging for migration runner
# Use a simple format without user_id since this runs at startup before any user context
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

class MigrationRunner:
    def __init__(self):
        self.db = next(get_db())
        self.ensure_migrations_table()

    def ensure_migrations_table(self):
        """Create migrations tracking table if it doesn't exist"""
        try:
            self.db.execute(text("""
                CREATE TABLE IF NOT EXISTS migrations (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(50) DEFAULT 'completed'
                )
            """))
            self.db.commit()
            logger.info("✅ Migrations table ready")
        except Exception as e:
            logger.error(f"❌ Failed to create migrations table: {e}")
            raise

    def is_migration_applied(self, migration_name: str) -> bool:
        """Check if a migration has already been applied"""
        try:
            result = self.db.execute(text("""
                SELECT COUNT(*) as count FROM migrations
                WHERE name = :name AND status = 'completed'
            """), {"name": migration_name})
            count = result.fetchone()[0]
            return count > 0
        except Exception:
            return False

    def mark_migration_applied(self, migration_name: str):
        """Mark a migration as applied"""
        try:
            self.db.execute(text("""
                INSERT INTO migrations (name, status)
                VALUES (:name, 'completed')
                ON CONFLICT (name) DO UPDATE SET
                    applied_at = CURRENT_TIMESTAMP,
                    status = 'completed'
            """), {"name": migration_name})
            self.db.commit()
            logger.info(f"✅ Marked migration as applied: {migration_name}")
        except Exception as e:
            logger.error(f"❌ Failed to mark migration as applied: {e}")

    def run_sql_migration(self, migration_name: str, sql_commands: List[str]) -> bool:
        """Run a SQL-based migration.

        IMPORTANT: This function includes a critical check for empty sql_commands.
        Previously, if load_sql_file() returned [] (due to FileNotFoundError or other
        issues), the for loop wouldn't execute but mark_migration_applied() would still
        run, causing "phantom" migrations that appeared complete but applied no changes.
        This caused recurring production issues where schema changes were missing.
        See migration 041_repair_survey_periods_migration for an example fix.
        """
        if self.is_migration_applied(migration_name):
            logger.info(f"⏭️  Skipping already applied migration: {migration_name}")
            return True

        # CRITICAL: Don't mark migration as complete if no SQL commands to run
        # This prevents silent failures when SQL files are missing or fail to load
        # (fixes a bug that caused 040_add_survey_periods to be marked complete without running)
        if not sql_commands:
            logger.error(f"❌ Migration {migration_name} has no SQL commands - skipping to prevent false completion")
            return False

        logger.info(f"🔧 Running migration: {migration_name}")

        try:
            for sql in sql_commands:
                self.db.execute(text(sql))

            self.db.commit()
            self.mark_migration_applied(migration_name)
            logger.info(f"✅ Successfully applied migration: {migration_name}")
            return True

        except Exception as e:
            logger.error(f"❌ Migration failed: {migration_name} - {e}")
            self.db.rollback()
            return False

    def load_sql_file(self, filename: str) -> List[str]:
        """Load SQL commands from a .sql file in the migrations directory.

        Handles dollar-quoted strings (DO $$ ... END $$;) correctly by not
        splitting on semicolons inside $$ blocks.
        """
        import os
        filepath = os.path.join(os.path.dirname(__file__), filename)
        try:
            with open(filepath, 'r') as f:
                content = f.read()

                # Remove comment lines starting with --
                lines = []
                for line in content.split('\n'):
                    # Skip full-line comments
                    if line.strip().startswith('--'):
                        continue
                    # Remove inline comments but preserve strings and dollar quotes
                    if '--' in line and '$$' not in line and "'" not in line:
                        line = line.split('--')[0]
                    if line.strip():
                        lines.append(line)

                # Join all lines
                full_content = '\n'.join(lines)

                # Parse SQL statements handling dollar-quoted strings
                commands = self._parse_sql_statements(full_content)

                return commands
        except FileNotFoundError:
            logger.warning(f"⚠️  SQL file not found: {filepath}")
            return []
        except Exception as e:
            logger.error(f"❌ Failed to load SQL file {filename}: {e}")
            return []

    def _parse_sql_statements(self, content: str) -> List[str]:
        """Parse SQL content into individual statements, respecting dollar-quoted strings.

        Dollar-quoted strings (e.g., DO $$ ... END $$;) contain semicolons that
        should not be treated as statement terminators.
        """
        commands = []
        current_statement = []
        in_dollar_quote = False
        i = 0

        while i < len(content):
            char = content[i]

            # Check for dollar quote start/end
            if content[i:i+2] == '$$':
                current_statement.append('$$')
                in_dollar_quote = not in_dollar_quote
                i += 2
                continue

            # Check for semicolon (statement terminator)
            if char == ';' and not in_dollar_quote:
                current_statement.append(';')
                stmt = ''.join(current_statement).strip()
                if stmt and stmt.upper() not in ('BEGIN;', 'COMMIT;', 'BEGIN', 'COMMIT'):
                    commands.append(stmt)
                current_statement = []
                i += 1
                continue

            current_statement.append(char)
            i += 1

        # Handle any remaining content (statement without trailing semicolon)
        remaining = ''.join(current_statement).strip()
        if remaining and remaining.upper() not in ('BEGIN', 'COMMIT'):
            commands.append(remaining + ';')

        return commands

    def run_all_migrations(self):
        """Run all pending migrations in order"""
        logger.info("🚀 Starting migration process...")

        migrations = [
            {
                "name": "001_add_integration_fields_to_analyses",
                "description": "Add integration_name and platform fields to analyses table",
                "sql": [
                    """
                    ALTER TABLE analyses
                    ADD COLUMN IF NOT EXISTS integration_name VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS platform VARCHAR(50)
                    """
                ]
            },
            {
                "name": "001b_create_organizations_tables",
                "description": "Create organizations, invitations, and notifications tables for multi-org support",
                "sql": [
                    """
                    CREATE TABLE IF NOT EXISTS organizations (
                        id SERIAL PRIMARY KEY,
                        name VARCHAR(255) NOT NULL,
                        domain VARCHAR(255) UNIQUE NOT NULL,
                        slug VARCHAR(100) UNIQUE NOT NULL,
                        status VARCHAR(20) DEFAULT 'active',
                        plan_type VARCHAR(50) DEFAULT 'free',
                        max_users INTEGER DEFAULT 50,
                        max_analyses_per_month INTEGER DEFAULT 5,
                        primary_contact_email VARCHAR(255),
                        billing_email VARCHAR(255),
                        website VARCHAR(255),
                        settings JSON DEFAULT '{}',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug)
                    """,
                    """
                    CREATE TABLE IF NOT EXISTS organization_invitations (
                        id SERIAL PRIMARY KEY,
                        organization_id INTEGER REFERENCES organizations(id),
                        email VARCHAR(255) NOT NULL,
                        role VARCHAR(20) DEFAULT 'user',
                        invited_by INTEGER REFERENCES users(id),
                        token VARCHAR(255) UNIQUE,
                        expires_at TIMESTAMP WITH TIME ZONE,
                        status VARCHAR(20) DEFAULT 'pending',
                        used_at TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_invitations_email ON organization_invitations(email)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_invitations_token ON organization_invitations(token)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_invitations_status ON organization_invitations(status)
                    """,
                    """
                    CREATE TABLE IF NOT EXISTS user_notifications (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id),
                        email VARCHAR(255),
                        organization_id INTEGER REFERENCES organizations(id),
                        type VARCHAR(50) NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        message TEXT,
                        action_url VARCHAR(500),
                        action_text VARCHAR(100),
                        organization_invitation_id INTEGER REFERENCES organization_invitations(id),
                        analysis_id INTEGER REFERENCES analyses(id),
                        status VARCHAR(20) DEFAULT 'unread',
                        priority VARCHAR(20) DEFAULT 'normal',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        read_at TIMESTAMP WITH TIME ZONE,
                        expires_at TIMESTAMP WITH TIME ZONE
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON user_notifications(user_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_notifications_email ON user_notifications(email)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_notifications_status ON user_notifications(status)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON user_notifications(created_at)
                    """,
                    """
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id),
                    ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user',
                    ADD COLUMN IF NOT EXISTS joined_org_at TIMESTAMP WITH TIME ZONE,
                    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE,
                    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)
                    """,
                    """
                    ALTER TABLE analyses
                    ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_analyses_organization_id ON analyses(organization_id)
                    """
                ]
            },
            {
                "name": "002_add_organization_id_to_user_correlations",
                "description": "Add organization_id to user_correlations for multi-tenancy support",
                "sql": [
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS organization_id INTEGER
                    """,
                    """
                    ALTER TABLE user_correlations
                    DROP CONSTRAINT IF EXISTS fk_user_correlations_organization
                    """,
                    """
                    ALTER TABLE user_correlations
                    ADD CONSTRAINT fk_user_correlations_organization
                    FOREIGN KEY (organization_id) REFERENCES organizations(id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_organization_id
                    ON user_correlations(organization_id)
                    """,
                    """
                    UPDATE user_correlations uc
                    SET organization_id = u.organization_id
                    FROM users u
                    WHERE uc.user_id = u.id
                    AND uc.organization_id IS NULL
                    AND u.organization_id IS NOT NULL
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_org_email
                    ON user_correlations(organization_id, email)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_org_slack
                    ON user_correlations(organization_id, slack_user_id)
                    WHERE slack_user_id IS NOT NULL
                    """
                ]
            },
            {
                "name": "003_add_name_to_user_correlations",
                "description": "Add name field to user_correlations for display names",
                "sql": [
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS name VARCHAR(255)
                    """
                ]
            },
            {
                "name": "004_add_integration_ids_to_user_correlations",
                "description": "Add integration_ids array to user_correlations for multi-integration support",
                "sql": [
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS integration_ids JSON
                    """
                ]
            },
            {
                "name": "005_add_personal_circumstances_to_reports",
                "description": "Add personal circumstances field to user_burnout_reports",
                "sql": [
                    """
                    ALTER TABLE user_burnout_reports
                    ADD COLUMN IF NOT EXISTS personal_circumstances TEXT
                    """
                ]
            },
            {
                "name": "006_make_slack_user_id_nullable",
                "description": "Make slack_user_id nullable in slack_integrations for OAuth bot tokens",
                "sql": [
                    """
                    ALTER TABLE slack_integrations
                    ALTER COLUMN slack_user_id DROP NOT NULL
                    """
                ]
            },
            {
                "name": "007_add_unique_constraint_user_correlation",
                "description": "Add unique constraint on (user_id, email) to prevent duplicate correlations",
                "sql": [
                    """
                    -- Remove any existing duplicates (keep the most recent one)
                    DELETE FROM user_correlations a
                    USING user_correlations b
                    WHERE a.id < b.id
                    AND a.user_id = b.user_id
                    AND a.email = b.email
                    """,
                    """
                    -- Add unique constraint (only if it doesn't exist)
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'uq_user_correlation_user_email'
                        ) THEN
                            ALTER TABLE user_correlations
                            ADD CONSTRAINT uq_user_correlation_user_email
                            UNIQUE (user_id, email);
                        END IF;
                    END $$;
                    """
                ]
            },
            {
                "name": "008_add_slack_feature_flags",
                "description": "Add feature flags to slack_workspace_mappings for survey and communication patterns analysis",
                "sql": [
                    """
                    ALTER TABLE slack_workspace_mappings
                    ADD COLUMN IF NOT EXISTS survey_enabled BOOLEAN DEFAULT FALSE
                    """,
                    """
                    ALTER TABLE slack_workspace_mappings
                    ADD COLUMN IF NOT EXISTS communication_patterns_enabled BOOLEAN DEFAULT FALSE
                    """,
                    """
                    ALTER TABLE slack_workspace_mappings
                    ADD COLUMN IF NOT EXISTS granted_scopes VARCHAR(500)
                    """,
                    """
                    -- Set survey_enabled=true for existing OAuth installations (backward compatibility)
                    UPDATE slack_workspace_mappings
                    SET survey_enabled = TRUE
                    WHERE registered_via = 'oauth'
                    AND survey_enabled IS NULL OR survey_enabled = FALSE
                    """
                ]
            },
            {
                "name": "009_rename_sentiment_to_communication_patterns",
                "description": "Rename sentiment_enabled column to communication_patterns_enabled",
                "sql": [
                    """
                    -- Check if sentiment_enabled column exists and rename it
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name = 'slack_workspace_mappings'
                            AND column_name = 'sentiment_enabled'
                        ) THEN
                            ALTER TABLE slack_workspace_mappings
                            RENAME COLUMN sentiment_enabled TO communication_patterns_enabled;
                        END IF;
                    END $$;
                    """
                ]
            },
            {
                "name": "010_add_organization_id_to_user_burnout_reports",
                "description": "Add organization_id to user_burnout_reports table",
                "sql": [
                    """
                    ALTER TABLE user_burnout_reports
                    ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_burnout_reports_organization_id
                    ON user_burnout_reports(organization_id)
                    """
                ]
            },
            {
                "name": "011_create_jira_integration_tables",
                "description": "Create Jira integration and workspace mapping tables",
                "sql": [
                    """
                    CREATE TABLE IF NOT EXISTS jira_integrations (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id),
                        access_token TEXT,
                        refresh_token TEXT,
                        jira_cloud_id VARCHAR(100) NOT NULL,
                        jira_site_url VARCHAR(255) NOT NULL,
                        jira_account_id VARCHAR(100),
                        jira_display_name VARCHAR(255),
                        jira_email VARCHAR(255),
                        accessible_resources JSONB DEFAULT '[]'::jsonb,
                        token_source VARCHAR(20) DEFAULT 'oauth',
                        token_expires_at TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_jira_integrations_user_id ON jira_integrations(user_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_jira_integrations_cloud_id ON jira_integrations(jira_cloud_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_jira_integrations_account_id ON jira_integrations(jira_account_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_jira_integrations_site_url ON jira_integrations(jira_site_url)
                    """,
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname = 'uq_jira_integrations_user_cloud'
                        ) THEN
                            ALTER TABLE jira_integrations
                            ADD CONSTRAINT uq_jira_integrations_user_cloud
                            UNIQUE (user_id, jira_cloud_id);
                        END IF;
                    END $$;
                    """,
                    """
                    CREATE TABLE IF NOT EXISTS jira_workspace_mappings (
                        id SERIAL PRIMARY KEY,
                        jira_cloud_id VARCHAR(100) NOT NULL UNIQUE,
                        jira_site_url VARCHAR(255) NOT NULL,
                        jira_site_name VARCHAR(255),
                        owner_user_id INTEGER NOT NULL REFERENCES users(id),
                        organization_id INTEGER REFERENCES organizations(id),
                        project_keys JSONB DEFAULT '[]'::jsonb,
                        monitored_boards JSONB DEFAULT '[]'::jsonb,
                        registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        registered_via VARCHAR(20) DEFAULT 'oauth',
                        status VARCHAR(20) DEFAULT 'active',
                        collection_enabled BOOLEAN DEFAULT TRUE,
                        workload_metrics_enabled BOOLEAN DEFAULT TRUE,
                        sprint_tracking_enabled BOOLEAN DEFAULT FALSE,
                        granted_scopes VARCHAR(500),
                        last_collection_at TIMESTAMP WITH TIME ZONE,
                        last_collection_status VARCHAR(50)
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_jira_workspace_mappings_cloud_id ON jira_workspace_mappings(jira_cloud_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_jira_workspace_mappings_organization_id ON jira_workspace_mappings(organization_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_jira_workspace_mappings_site_url ON jira_workspace_mappings(jira_site_url)
                    """,
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS jira_account_id VARCHAR(100)
                    """,
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS jira_email VARCHAR(255)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_jira_account_id
                    ON user_correlations(jira_account_id) WHERE jira_account_id IS NOT NULL
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_jira_email
                    ON user_correlations(jira_email) WHERE jira_email IS NOT NULL
                    """
                ]
            },

            {
                "name": "012_add_survey_recipients_to_integrations",
                "description": "Add survey_recipients JSON field to rootly_integrations for storing selected survey recipients",
                "sql": [
                    """
                    ALTER TABLE rootly_integrations
                    ADD COLUMN IF NOT EXISTS survey_recipients JSON
                    """
                ]
            },
            {
                "name": "013_ensure_user_correlation_platform_fields",
                "description": "Ensure github_username and slack_user_id fields exist in user_correlations for analytics",
                "sql": [
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS github_username VARCHAR(100)
                    """,
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS slack_user_id VARCHAR(20)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_github_username
                    ON user_correlations(github_username)
                    WHERE github_username IS NOT NULL
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_slack_user_id
                    ON user_correlations(slack_user_id)
                    WHERE slack_user_id IS NOT NULL
                    """
                ]
            },
            {
                "name": "014_add_active_llm_token_source",
                "description": "Add active_llm_token_source field to track which token (system or custom) is active",
                "sql": [
                    """
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS active_llm_token_source VARCHAR(20) DEFAULT 'system'
                    """,
                    """
                    COMMENT ON COLUMN users.active_llm_token_source IS 'Which LLM token is currently active: system or custom'
                    """
                ]
            },
            {
                "name": "015_add_rootly_user_id_to_user_correlations",
                "description": "Add rootly_user_id field to store Rootly API user ID (needed for incident matching)",
                "sql": [
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS rootly_user_id VARCHAR(50)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_rootly_user_id
                    ON user_correlations(rootly_user_id)
                    """,
                    """
                    COMMENT ON COLUMN user_correlations.rootly_user_id IS 'Rootly API user ID for incident matching'
                    """
                ]
            },
            {
                "name": "016_add_permissions_caching",
                "description": "Add permissions caching to rootly_integrations",
                "sql": [
                    """
                    ALTER TABLE rootly_integrations
                    ADD COLUMN IF NOT EXISTS cached_permissions JSON,
                    ADD COLUMN IF NOT EXISTS permissions_checked_at TIMESTAMP WITH TIME ZONE
                    """,
                    """
                    COMMENT ON COLUMN rootly_integrations.cached_permissions IS 'Cached permission check results to reduce API calls'
                    """,
                    """
                    COMMENT ON COLUMN rootly_integrations.permissions_checked_at IS 'Timestamp when permissions were last checked'
                    """
                ]
            },
            {
                "name": "017_create_oauth_temp_codes_table",
                "description": "Create oauth_temp_codes table for OAuth flow token exchange",
                "sql": [
                    """
                    CREATE TABLE IF NOT EXISTS oauth_temp_codes (
                        id SERIAL PRIMARY KEY,
                        code VARCHAR(255) UNIQUE NOT NULL,
                        jwt_token TEXT NOT NULL,
                        user_id INTEGER NOT NULL REFERENCES users(id),
                        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_oauth_temp_codes_code ON oauth_temp_codes(code)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_oauth_temp_codes_expires_at ON oauth_temp_codes(expires_at)
                    """,
                    """
                    COMMENT ON TABLE oauth_temp_codes IS 'Temporary storage for OAuth authorization codes during token exchange'
                    """
                ]
            },
            {
                "name": "018_add_user_correlation_active_tracking",
                "description": "Add last_synced_at and is_active columns to user_correlations for sync tracking",
                "sql": [
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE
                    """,
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1
                    """,
                    """
                    COMMENT ON COLUMN user_correlations.last_synced_at IS 'Last time this user was seen in a sync operation'
                    """,
                    """
                    COMMENT ON COLUMN user_correlations.is_active IS 'Soft delete flag: 1 = active, 0 = inactive/stale'
                    """,
                    """
                    UPDATE user_correlations
                    SET is_active = 1, last_synced_at = created_at
                    WHERE is_active IS NULL
                    """
                ]
            },
            {
                "name": "019_make_survey_organization_nullable",
                "description": "Make organization_id nullable in user_burnout_reports to allow surveys without org constraint",
                "sql": [
                    """
                    -- Drop the foreign key constraint if it exists
                    ALTER TABLE user_burnout_reports
                    DROP CONSTRAINT IF EXISTS user_burnout_reports_organization_id_fkey
                    """,
                    """
                    -- Make organization_id nullable
                    ALTER TABLE user_burnout_reports
                    ALTER COLUMN organization_id DROP NOT NULL
                    """
                ]
            },
            {
                "name": "020_add_email_domain_for_data_sharing",
                "description": "Add email_domain column to users and user_correlations for domain-based data sharing",
                "sql": [
                    """
                    -- Add email_domain to users table
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255)
                    """,
                    """
                    -- Populate email_domain from existing emails
                    UPDATE users
                    SET email_domain = LOWER(SUBSTRING(email FROM POSITION('@' IN email) + 1))
                    WHERE email_domain IS NULL AND email LIKE '%@%'
                    """,
                    """
                    -- Create index on users.email_domain for performance
                    CREATE INDEX IF NOT EXISTS idx_users_email_domain ON users(email_domain)
                    """,
                    """
                    -- Add email_domain to user_correlations for faster queries
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255)
                    """,
                    """
                    -- Populate user_correlations.email_domain from users
                    UPDATE user_correlations uc
                    SET email_domain = u.email_domain
                    FROM users u
                    WHERE uc.user_id = u.id AND uc.email_domain IS NULL
                    """,
                    """
                    -- Create index on user_correlations.email_domain for performance
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_email_domain ON user_correlations(email_domain)
                    """
                ]
            },
            {
                "name": "021_add_email_domain_to_surveys",
                "description": "Add email_domain to user_burnout_reports for domain-based survey aggregation",
                "sql": [
                    """
                    -- Add email_domain to user_burnout_reports
                    ALTER TABLE user_burnout_reports
                    ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255)
                    """,
                    """
                    -- Populate email_domain from users table
                    UPDATE user_burnout_reports ubr
                    SET email_domain = u.email_domain
                    FROM users u
                    WHERE ubr.user_id = u.id AND ubr.email_domain IS NULL
                    """,
                    """
                    -- Create index for performance
                    CREATE INDEX IF NOT EXISTS idx_user_burnout_reports_email_domain ON user_burnout_reports(email_domain)
                    """
                ]
            },
            {
                "name": "022_make_analysis_id_nullable",
                "description": "Make analysis_id nullable in user_burnout_reports",
                "sql": [
                    """
                    -- Make analysis_id nullable since surveys can be submitted without an analysis
                    ALTER TABLE user_burnout_reports ALTER COLUMN analysis_id DROP NOT NULL
                    """
                ]
            },
            {
                "name": "023_create_linear_integration_tables",
                "description": "Create Linear integration and workspace mapping tables",
                "sql": [
                    """
                    CREATE TABLE IF NOT EXISTS linear_integrations (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id),
                        access_token TEXT,
                        refresh_token TEXT,
                        workspace_id VARCHAR(100) NOT NULL,
                        workspace_name VARCHAR(255),
                        workspace_url_key VARCHAR(255),
                        linear_user_id VARCHAR(100),
                        linear_display_name VARCHAR(255),
                        linear_email VARCHAR(255),
                        accessible_workspaces JSONB DEFAULT '[]'::jsonb,
                        token_source VARCHAR(20) DEFAULT 'oauth',
                        token_expires_at TIMESTAMP WITH TIME ZONE,
                        pkce_code_verifier TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_linear_integrations_user_id ON linear_integrations(user_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_linear_integrations_workspace_id ON linear_integrations(workspace_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_linear_integrations_linear_user_id ON linear_integrations(linear_user_id)
                    """,
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname = 'uq_linear_integrations_user_workspace'
                        ) THEN
                            ALTER TABLE linear_integrations
                            ADD CONSTRAINT uq_linear_integrations_user_workspace
                            UNIQUE (user_id, workspace_id);
                        END IF;
                    END $$;
                    """,
                    """
                    CREATE TABLE IF NOT EXISTS linear_workspace_mappings (
                        id SERIAL PRIMARY KEY,
                        workspace_id VARCHAR(100) NOT NULL UNIQUE,
                        workspace_name VARCHAR(255),
                        workspace_url_key VARCHAR(255),
                        owner_user_id INTEGER NOT NULL REFERENCES users(id),
                        organization_id INTEGER REFERENCES organizations(id),
                        team_ids JSONB DEFAULT '[]'::jsonb,
                        team_names JSONB DEFAULT '[]'::jsonb,
                        registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        registered_via VARCHAR(20) DEFAULT 'oauth',
                        status VARCHAR(20) DEFAULT 'active',
                        collection_enabled BOOLEAN DEFAULT TRUE,
                        workload_metrics_enabled BOOLEAN DEFAULT TRUE,
                        granted_scopes VARCHAR(500),
                        last_collection_at TIMESTAMP WITH TIME ZONE,
                        last_collection_status VARCHAR(50)
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_linear_workspace_mappings_workspace_id ON linear_workspace_mappings(workspace_id)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_linear_workspace_mappings_organization_id ON linear_workspace_mappings(organization_id)
                    """,
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS linear_user_id VARCHAR(100)
                    """,
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS linear_email VARCHAR(255)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_linear_user_id
                    ON user_correlations(linear_user_id) WHERE linear_user_id IS NOT NULL
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_linear_email
                    ON user_correlations(linear_email) WHERE linear_email IS NOT NULL
                    """
                ]
            },
            {
                "name": "024_add_survey_frequency_options",
                "description": "Add survey configuration columns to survey_schedules",
                "sql": [
                    """
                    -- Add send_reminder column if missing
                    ALTER TABLE survey_schedules
                    ADD COLUMN IF NOT EXISTS send_reminder BOOLEAN DEFAULT TRUE
                    """,
                    """
                    -- Add reminder_time column if missing
                    ALTER TABLE survey_schedules
                    ADD COLUMN IF NOT EXISTS reminder_time TIME
                    """,
                    """
                    -- Add reminder_hours_after column if missing
                    ALTER TABLE survey_schedules
                    ADD COLUMN IF NOT EXISTS reminder_hours_after INTEGER DEFAULT 5
                    """,
                    """
                    -- Add CHECK constraint for frequency_type (idempotent)
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'check_frequency_type'
                        ) THEN
                            ALTER TABLE survey_schedules
                            ADD CONSTRAINT check_frequency_type
                            CHECK (frequency_type IN ('daily', 'weekday', 'weekly'));
                        END IF;
                    END $$
                    """,
                    """
                    -- Add CHECK constraint for frequency_type (idempotent)
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'check_frequency_type'
                        ) THEN
                            ALTER TABLE survey_schedules
                            ADD CONSTRAINT check_frequency_type
                            CHECK (frequency_type IN ('daily', 'weekday', 'weekly'));
                        END IF;
                    END $$
                    """,
                    """
                    -- Add CHECK constraint for day_of_week (idempotent)
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'check_day_of_week'
                        ) THEN
                            ALTER TABLE survey_schedules
                            ADD CONSTRAINT check_day_of_week
                            CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6));
                        END IF;
                    END $$
                    """,
                    """
                    -- Add CHECK constraint for frequency_type (with existence check)
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
                    """,
                    """
                    -- Add CHECK constraint for day_of_week (with existence check)
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
                    """
                ]
            },
            {
                "name": "025_remove_github_username_unique_constraint",
                "description": "Remove orphaned uq_github_username constraint that causes conflicts with multi-email users",
                "sql": [
                    """
                    -- Drop the unique constraint if it exists
                    -- This constraint was preventing users from connecting multiple emails
                    -- with the same GitHub username, which is a legitimate use case
                    DO $$
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'uq_github_username'
                            AND conrelid = 'user_correlations'::regclass
                        ) THEN
                            ALTER TABLE user_correlations DROP CONSTRAINT uq_github_username;
                            RAISE NOTICE 'Dropped uq_github_username constraint from user_correlations';
                        ELSE
                            RAISE NOTICE 'uq_github_username constraint does not exist, skipping drop';
                        END IF;
                    END $$;
                    """
                ]
            },
            {
                "name": "026_make_user_correlations_user_id_nullable",
                "description": "Make user_id nullable to support org-scoped team roster data",
                "sql": [
                    """
                    -- Make user_id nullable for organization-scoped team roster data
                    -- This allows storing team members from integrations (PagerDuty, Jira, Linear)
                    -- who don't have user accounts yet (org-scoped data)
                    ALTER TABLE user_correlations
                    ALTER COLUMN user_id DROP NOT NULL;
                    """,
                    """
                    -- Drop problematic unique constraints on platform IDs (if they exist)
                    -- These prevent multiple users from having the same platform ID
                    DO $$
                    BEGIN
                        -- Drop jira_account_id unique constraint
                        IF EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'uq_jira_account_id'
                            AND conrelid = 'user_correlations'::regclass
                        ) THEN
                            ALTER TABLE user_correlations DROP CONSTRAINT uq_jira_account_id;
                            RAISE NOTICE 'Dropped uq_jira_account_id constraint';
                        END IF;

                        -- Drop linear_user_id unique constraint
                        IF EXISTS (
                            SELECT 1 FROM pg_constraint
                            WHERE conname = 'uq_linear_user_id'
                            AND conrelid = 'user_correlations'::regclass
                        ) THEN
                            ALTER TABLE user_correlations DROP CONSTRAINT uq_linear_user_id;
                            RAISE NOTICE 'Dropped uq_linear_user_id constraint';
                        END IF;
                    END $$;
                    """,
                    """
                    -- Create unique constraint for org-scoped data (where user_id is NULL)
                    -- Ensures one record per email per organization for team roster data
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_user_correlations_org_email_null_user
                    ON user_correlations (organization_id, email)
                    WHERE user_id IS NULL;
                    """,
                    """
                    -- Add index for better performance on org-scoped queries
                    CREATE INDEX IF NOT EXISTS idx_user_correlations_org_null_user
                    ON user_correlations (organization_id)
                    WHERE user_id IS NULL;
                    """,
                    """
                    -- Add comment explaining the dual-mode system
                    COMMENT ON COLUMN user_correlations.user_id IS 'User ID for registered users, NULL for org-scoped team roster data from integrations';
                    """
                ]
            },
            {
                "name": "027_rename_survey_columns",
                "description": "Rename user_burnout_reports columns from self_reported_score/energy_level to feeling_score/workload_score",
                "sql": [
                    """
                    DO $$
                    BEGIN
                        -- Only rename if old column exists and new column doesn't
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_burnout_reports' AND column_name = 'self_reported_score')
                        AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_burnout_reports' AND column_name = 'workload_score') THEN
                            ALTER TABLE user_burnout_reports RENAME COLUMN self_reported_score TO workload_score;
                        END IF;
                    END $$;
                    """,
                    """
                    DO $$
                    BEGIN
                        -- Only rename if old column exists and new column doesn't
                        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_burnout_reports' AND column_name = 'energy_level')
                        AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_burnout_reports' AND column_name = 'feeling_score') THEN
                            ALTER TABLE user_burnout_reports RENAME COLUMN energy_level TO feeling_score;
                        END IF;
                    END $$;
                    """,
                    """
                    ALTER TABLE user_burnout_reports
                    DROP CONSTRAINT IF EXISTS user_burnout_reports_self_reported_score_check
                    """,
                    """
                    ALTER TABLE user_burnout_reports
                    DROP CONSTRAINT IF EXISTS user_burnout_reports_energy_level_check
                    """,
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_burnout_reports_feeling_score_check') THEN
                            ALTER TABLE user_burnout_reports
                            ADD CONSTRAINT user_burnout_reports_feeling_score_check
                            CHECK (feeling_score >= 1 AND feeling_score <= 5);
                        END IF;
                    END $$;
                    """,
                    """
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_burnout_reports_workload_score_check') THEN
                            ALTER TABLE user_burnout_reports
                            ADD CONSTRAINT user_burnout_reports_workload_score_check
                            CHECK (workload_score >= 1 AND workload_score <= 5);
                        END IF;
                    END $$;
                    """
                ]
            },
            {
                "name": "026_add_organization_id_to_integration_mappings",
                "description": "Add organization_id column to integration_mappings for org-scoped mappings",
                "sql": [
                    """
                    -- Add organization_id column to integration_mappings
                    ALTER TABLE integration_mappings
                    ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id)
                    """,
                    """
                    -- Add index for faster lookups by organization
                    CREATE INDEX IF NOT EXISTS idx_integration_mappings_org_id
                    ON integration_mappings(organization_id)
                    """
                ]
            },
            {
                "name": "028_simplify_roles",
                "description": "Simplify role system from 5 roles to 3 roles",
                "sql_file": "2025_01_17_simplify_roles.sql"
            },
            {
                "name": "029_create_organizations_for_existing_users",
                "description": "Create organizations for existing users based on email domains",
                "sql_file": "2025_01_18_create_organizations_for_existing_users.sql"
            },
            {
                "name": "030_migrate_user_role_to_member",
                "description": "Convert legacy 'user' role to 'member'",
                "sql_file": "2025_01_30_migrate_user_role_to_member.sql"
            },
            {
                "name": "031_allow_null_user_id_in_integration_mappings",
                "description": "Make user_id nullable in integration_mappings and add organization_id for org-scoped users",
                "sql_file": "2026_01_02_allow_null_user_id_in_integration_mappings.sql"
            },
            {
                "name": "032_remove_communication_patterns_toggle",
                "description": "Remove communication_patterns_enabled column from slack_workspace_mappings",
                "sql_file": "2026_01_06_remove_communication_patterns_toggle.sql"
            },
            {
                "name": "033_add_email_to_user_burnout_reports",
                "description": "Add email column to user_burnout_reports and backfill from users table",
                "sql_file": "2026_01_12_add_email_to_user_burnout_reports.sql"
            },
            {
                "name": "034_allow_null_user_id_in_user_burnout_reports",
                "description": "Allow NULL user_id in user_burnout_reports for email-based matching",
                "sql_file": "2026_01_12_allow_null_user_id_in_user_burnout_reports.sql"
            },
            {
                "name": "035_make_email_required_in_user_burnout_reports",
                "description": "Make email column required in user_burnout_reports",
                "sql_file": "2026_01_12_make_email_required_in_user_burnout_reports.sql"
            },
            {
                "name": "036_add_timezone_to_user_correlations",
                "description": "Add timezone column to user_correlations for user-specific working hours",
                "sql": [
                    """
                    ALTER TABLE user_correlations
                    ADD COLUMN IF NOT EXISTS timezone VARCHAR(50)
                    """,
                    """
                    COMMENT ON COLUMN user_correlations.timezone IS 'User timezone from Rootly/PagerDuty (e.g., America/New_York) for accurate after-hours calculation'
                    """
                ]
            },
            {
                "name": "037_add_avatar_url_to_user_correlations",
                "description": "Add avatar_url column for profile images from PagerDuty/Rootly",
                "sql_file": "2026_01_17_add_avatar_url_to_user_correlations.sql"
            },
            {
                "name": "038_add_cascade_delete_to_integration_mappings",
                "description": "Add CASCADE DELETE to integration_mappings.analysis_id foreign key to fix user deletion foreign key violations",
                "sql_file": "2026_01_21_add_cascade_delete_to_integration_mappings.sql"
            },
            {
                "name": "039_add_performance_indexes",
                "description": "Add missing indexes to analyses, integration_mappings, user_notifications, and rootly_integrations for query performance",
                "sql_file": "2026_01_21_add_performance_indexes.sql"
            },
            {
                "name": "040_add_survey_periods",
                "description": "Add survey_periods table for daily follow-up reminders tracking",
                "sql_file": "2026_01_22_add_survey_periods.sql"
            },
            {
                "name": "041_repair_survey_periods_migration",
                "description": "Repair false-positive migration 040 if columns don't exist (fixes migration runner bug)",
                "sql_file": "2026_01_23_repair_survey_periods_migration.sql"
            },
            {
                "name": "042_add_last_modified_to_survey_schedules",
                "description": "Add last_modified_by_user_id and last_modified_at columns to track survey schedule changes",
                "sql_file": "2026_01_26_add_last_modified_to_survey_schedules.sql"
            },
            {
                "name": "042a_add_partial_unique_constraints_user_correlation",
                "description": "Add partial unique constraints to prevent duplicate user_correlations and auto-clean existing duplicates",
                "sql_file": "2026_02_02_add_partial_unique_constraints_user_correlation.sql"
            },
            {
                "name": "043_add_sync_tracking_to_rootly_integrations",
                "description": "Add last_synced_by and last_synced_at columns to track who last synced each integration",
                "sql_file": "2026_02_06_add_sync_tracking_to_rootly_integrations.sql"
            },
            {
                "name": "044_optimize_get_platform_mappings",
                "description": "Add composite indexes to optimize get_platform_mappings endpoint",
                "sql_file": "2026_02_06_optimize_get_platform_mappings.sql"
            },
            {
                "name": "045_add_organization_id_to_slack_integrations",
                "description": "Add organization_id column to slack_integrations for org-level Slack management",
                "sql_file": "2026_02_06_add_organization_id_to_slack_integrations.sql"
            },
            {
                "name": "046_add_analysis_save_and_autorefresh",
                "description": "Add is_saved, is_auto_refresh, and auto_refresh_interval columns to analyses table",
                "sql": [
                    """
                    ALTER TABLE analyses ADD COLUMN IF NOT EXISTS is_saved BOOLEAN NOT NULL DEFAULT FALSE
                    """,
                    """
                    ALTER TABLE analyses ADD COLUMN IF NOT EXISTS is_auto_refresh BOOLEAN NOT NULL DEFAULT FALSE
                    """,
                    """
                    ALTER TABLE analyses ADD COLUMN IF NOT EXISTS auto_refresh_interval VARCHAR(20)
                    """,
                    """
                    UPDATE analyses SET is_saved = TRUE WHERE is_saved = FALSE
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_analyses_user_auto_refresh
                    ON analyses(user_id, organization_id, is_auto_refresh)
                    WHERE is_auto_refresh = TRUE
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_analyses_user_saved
                    ON analyses(user_id, organization_id, is_saved)
                    WHERE is_saved = TRUE
                    """
                ]
            },
            {
                "name": "047_seed_auto_refresh_from_latest_real_analysis",
                "description": "Seed auto-refresh (24h) from each user's latest non-demo analysis with a valid integration",
                "sql": [
                    """
                    WITH latest_real AS (
                        SELECT DISTINCT ON (a.user_id) a.id
                        FROM analyses a
                        JOIN rootly_integrations r ON r.id = a.rootly_integration_id
                        WHERE a.status = 'completed'
                          AND a.is_auto_refresh = FALSE
                          AND a.rootly_integration_id IS NOT NULL
                          AND r.is_active = TRUE
                          AND r.api_token IS NOT NULL
                          AND btrim(r.api_token) <> ''
                          AND COALESCE((a.config->>'is_demo')::boolean, FALSE) = FALSE
                          AND NOT EXISTS (
                              SELECT 1
                              FROM analyses ar
                              WHERE ar.user_id = a.user_id
                                AND ar.is_auto_refresh = TRUE
                          )
                        ORDER BY a.user_id, a.created_at DESC
                    )
                    UPDATE analyses
                    SET is_auto_refresh = TRUE,
                        auto_refresh_interval = '24h'
                    WHERE id IN (SELECT id FROM latest_real)
                    """
                ]
            },
            {
                "name": "048_create_weekly_digest_logs",
                "description": "Create weekly_digest_logs table for weekly email idempotency",
                "sql": [
                    """
                    CREATE TABLE IF NOT EXISTS weekly_digest_logs (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        analysis_id INTEGER REFERENCES analyses(id) ON DELETE SET NULL,
                        week_start_date DATE NOT NULL,
                        timezone VARCHAR(50),
                        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_digest_user_week
                    ON weekly_digest_logs(user_id, week_start_date)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_weekly_digest_user_sent_at
                    ON weekly_digest_logs(user_id, sent_at DESC)
                    """
                ]
            },
            {
                "name": "049_add_weekly_digest_enabled_to_users",
                "description": "Add weekly_digest_enabled column to users for per-user digest opt-out",
                "sql": [
                    """
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_digest_enabled BOOLEAN NOT NULL DEFAULT TRUE
                    """
                ]
            },
            {
                "name": "046_add_team_scoped_key_to_rootly_integrations",
                "description": "Add key_type and team_name columns to rootly_integrations for team-scoped API key support",
                "sql_file": "2026_02_24_add_team_scoped_key_to_rootly_integrations.sql"
            },
            {
                "name": "050_add_survey_recipients_to_slack_workspace_mappings",
                "description": "Store scheduled Slack survey recipients on the org's active Slack workspace mapping",
                "sql_file": "2026_03_13_add_survey_recipients_to_slack_workspace_mappings.sql"
            },
            {
                "name": "051_add_user_login_audit",
                "description": "Track user login summaries and per-login audit events",
                "sql": [
                    """
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE
                    """,
                    """
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0
                    """,
                    """
                    ALTER TABLE oauth_temp_codes
                    ADD COLUMN IF NOT EXISTS auth_method VARCHAR(50)
                    """,
                    """
                    CREATE TABLE IF NOT EXISTS user_login_events (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
                        auth_method VARCHAR(50) NOT NULL,
                        ip_address VARCHAR(64),
                        user_agent VARCHAR(1000),
                        logged_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_login_events_user_logged_in_at
                    ON user_login_events(user_id, logged_in_at DESC)
                    """,
                    """
                    CREATE INDEX IF NOT EXISTS idx_user_login_events_org_logged_in_at
                    ON user_login_events(organization_id, logged_in_at DESC)
                    """,
                    """
                    COMMENT ON TABLE user_login_events IS 'Audit log of successful user logins'
                    """
                ]
            },
            # Add future migrations here with incrementing numbers
        ]

        success_count = 0
        total_migrations = len(migrations)

        for migration in migrations:
            name = migration["name"]
            description = migration["description"]

            # Handle both inline SQL and SQL files
            if "sql_file" in migration:
                sql_commands = self.load_sql_file(migration["sql_file"])
            else:
                sql_commands = migration.get("sql", [])

            logger.info(f"📋 Migration: {description}")

            if self.run_sql_migration(name, sql_commands):
                success_count += 1
            else:
                logger.error(f"❌ Migration failed: {name}")
                # Continue with other migrations instead of stopping
                continue

        logger.info(f"🎉 Migration process completed: {success_count}/{total_migrations} successful")

        if success_count == total_migrations:
            logger.info("✅ All migrations applied successfully!")
            return True
        else:
            logger.warning(f"⚠️  Some migrations failed: {total_migrations - success_count} failed")
            return False

    def get_migration_status(self):
        """Get status of all migrations"""
        try:
            result = self.db.execute(text("""
                SELECT name, applied_at, status
                FROM migrations
                ORDER BY applied_at
            """))

            migrations = []
            for row in result:
                migrations.append({
                    "name": row[0],
                    "applied_at": row[1],
                    "status": row[2]
                })

            logger.info(f"📊 Migration status: {len(migrations)} migrations applied")
            for migration in migrations:
                logger.info(f"  ✅ {migration['name']} - {migration['applied_at']}")

            return migrations

        except Exception as e:
            logger.error(f"❌ Failed to get migration status: {e}")
            return []

    def close(self):
        """Close database connection"""
        if self.db:
            self.db.close()

def run_migrations():
    """Main function to run all migrations"""
    runner = None
    try:
        runner = MigrationRunner()
        success = runner.run_all_migrations()
        runner.get_migration_status()
        return success

    except Exception as e:
        logger.error(f"❌ Migration system failed: {e}")
        return False

    finally:
        if runner:
            runner.close()

if __name__ == "__main__":
    success = run_migrations()
    sys.exit(0 if success else 1)
