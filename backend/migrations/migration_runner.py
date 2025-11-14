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

logging.basicConfig(level=logging.INFO)
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
        """Run a SQL-based migration"""
        if self.is_migration_applied(migration_name):
            logger.info(f"⏭️  Skipping already applied migration: {migration_name}")
            return True

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
                "name": "011_add_survey_recipients_to_integrations",
                "description": "Add survey_recipients JSON field to rootly_integrations for storing selected survey recipients",
                "sql": [
                    """
                    ALTER TABLE rootly_integrations
                    ADD COLUMN IF NOT EXISTS survey_recipients JSON
                    """
                ]
            },
            {
                "name": "012_ensure_user_correlation_platform_fields",
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
                "name": "013_add_active_llm_token_source",
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
            # Add future migrations here with incrementing numbers
            # {
            #     "name": "011_add_user_preferences",
            #     "description": "Add user preferences table",
            #     "sql": ["CREATE TABLE IF NOT EXISTS user_preferences (...)"]
            # }
        ]

        success_count = 0
        total_migrations = len(migrations)

        for migration in migrations:
            name = migration["name"]
            description = migration["description"]
            sql_commands = migration["sql"]

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