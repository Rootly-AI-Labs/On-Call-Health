"""
Admin endpoints for database maintenance and fixes.
"""
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...models import get_db
from ...models import Analysis
from ...models.slack_workspace_mapping import SlackWorkspaceMapping
from ...models.slack_integration import SlackIntegration
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter(
    prefix="/admin",
    tags=["admin"]
)

@router.post("/fix-null-organizations")
async def fix_null_organizations(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Fix historical analyses that have null organization names.
    This is a one-time maintenance endpoint.
    """
    
    # Find and fix analyses with null organization names
    analyses = db.query(Analysis).filter(
        Analysis.results.isnot(None)
    ).all()
    
    updated_count = 0
    analysis_details = []
    
    for analysis in analyses:
        if analysis.results and isinstance(analysis.results, dict):
            metadata = analysis.results.get('metadata', {})
            
            # Check if organization_name is null or missing
            current_org_name = metadata.get('organization_name')
            if current_org_name is None or current_org_name == 'null':
                # Use generic fallback for null organization names
                new_org_name = "Organization"

                # Update the organization name
                metadata['organization_name'] = new_org_name
                analysis.results['metadata'] = metadata
                
                # Mark as modified
                db.add(analysis)
                updated_count += 1
                
                analysis_details.append({
                    "id": analysis.id,
                    "created_at": analysis.created_at.isoformat(),
                    "old_name": current_org_name,
                    "new_name": new_org_name
                })
    
    if updated_count > 0:
        db.commit()
    
    # Get summary of organization names after update
    org_summary = {}
    total_analyses = 0
    
    for analysis in analyses:
        if analysis.results and isinstance(analysis.results, dict):
            metadata = analysis.results.get('metadata', {})
            org_name = metadata.get('organization_name', 'Unknown')
            org_summary[org_name] = org_summary.get(org_name, 0) + 1
            total_analyses += 1
    
    return {
        "status": "success",
        "updated_count": updated_count,
        "total_analyses": total_analyses,
        "organization_summary": org_summary,
        "updated_analyses": analysis_details[:10],  # Show first 10 for brevity
        "message": f"Updated {updated_count} analyses with proper organization names"
    }

@router.post("/migrate-slack-workspace-mappings")
async def migrate_slack_workspace_mappings(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Create slack_workspace_mappings table and migrate existing Slack integrations.
    This is a one-time migration endpoint for multi-org Slack support.
    """

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS slack_workspace_mappings (
        id SERIAL PRIMARY KEY,

        -- Slack workspace identification
        workspace_id VARCHAR(20) NOT NULL UNIQUE,  -- T01234567 (Slack team ID)
        workspace_name VARCHAR(255),               -- "Acme Corp"
        workspace_domain VARCHAR(255),             -- "acme-corp.slack.com"

        -- Organization mapping
        owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_domain VARCHAR(255),          -- "company.com"

        -- Registration tracking
        registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        registered_via VARCHAR(20) DEFAULT 'oauth',  -- 'oauth', 'manual', 'admin'

        -- Status and management
        status VARCHAR(20) DEFAULT 'active',       -- 'active', 'suspended', 'pending'

        -- Constraints
        CONSTRAINT unique_workspace_id UNIQUE(workspace_id)
    );
    """

    create_indexes_sql = """
    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_slack_workspace_mappings_owner_user_id ON slack_workspace_mappings(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_slack_workspace_mappings_workspace_id ON slack_workspace_mappings(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_slack_workspace_mappings_status ON slack_workspace_mappings(status);
    CREATE INDEX IF NOT EXISTS idx_slack_workspace_mappings_domain ON slack_workspace_mappings(organization_domain);
    """

    create_trigger_function_sql = """
    -- Future-proofing: trigger function for updated_at column
    CREATE OR REPLACE FUNCTION update_slack_workspace_mappings_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';
    """

    migrate_existing_sql = """
    -- Migrate existing slack_integrations to workspace mappings
    INSERT INTO slack_workspace_mappings (
        workspace_id,
        workspace_name,
        owner_user_id,
        registered_via,
        status
    )
    SELECT DISTINCT
        si.workspace_id,
        'Legacy Workspace' as workspace_name,
        si.user_id as owner_user_id,
        'legacy' as registered_via,
        'active' as status
    FROM slack_integrations si
    WHERE si.workspace_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM slack_workspace_mappings swm
          WHERE swm.workspace_id = si.workspace_id
      );
    """

    try:
        # Start transaction
        results = {}

        # Create table
        db.execute(text(create_table_sql))
        results["table_created"] = True

        # Create indexes
        db.execute(text(create_indexes_sql))
        results["indexes_created"] = True

        # Create trigger function
        db.execute(text(create_trigger_function_sql))
        results["trigger_function_created"] = True

        # Migrate existing integrations
        migration_result = db.execute(text(migrate_existing_sql))
        migrated_count = migration_result.rowcount
        results["migrated_count"] = migrated_count

        # Commit all changes
        db.commit()

        # Verify table creation
        verify_result = db.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'slack_workspace_mappings'
            ORDER BY ordinal_position;
        """))
        columns = verify_result.fetchall()
        results["columns"] = [{"name": col[0], "type": col[1], "nullable": col[2]} for col in columns]

        # Get count of workspace mappings
        count_result = db.execute(text("SELECT COUNT(*) FROM slack_workspace_mappings"))
        total_count = count_result.scalar()
        results["total_workspace_mappings"] = total_count

        return {
            "status": "success",
            "message": f"Successfully created slack_workspace_mappings table and migrated {migrated_count} existing workspace(s)",
            "results": results
        }

    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during migration: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Migration failed: {str(e)}")

@router.post("/migrate-organizations")
async def migrate_organizations(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Run the complete organizations migration - creates organizations, invitations, and notifications tables.
    This is a one-time migration for multi-org support.
    """
    try:
        # Import and run the migration
        import sys
        import os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../..'))

        from migrate_organizations_mvp import (
            create_organizations_table,
            add_organization_columns,
            populate_organizations,
            verify_migration,
            get_database_url
        )
        from sqlalchemy import create_engine

        # Create engine using the same database URL
        database_url = get_database_url()
        engine = create_engine(database_url)

        results = {}

        # Step 1: Create organizations table
        if create_organizations_table(engine):
            results["organizations_table"] = "created"
        else:
            results["organizations_table"] = "failed"
            return {"status": "error", "results": results}

        # Step 2: Add organization columns
        if add_organization_columns(engine):
            results["organization_columns"] = "added"
        else:
            results["organization_columns"] = "failed"
            return {"status": "error", "results": results}

        # Step 3: Populate organizations from existing data
        if populate_organizations(engine):
            results["organizations_populated"] = "success"
        else:
            results["organizations_populated"] = "failed"
            return {"status": "error", "results": results}

        # Step 4: Verify migration
        if verify_migration(engine):
            results["migration_verified"] = "success"
        else:
            results["migration_verified"] = "failed"

        return {
            "status": "success",
            "message": "Organizations migration completed successfully!",
            "results": results
        }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Organizations migration failed: {str(e)}",
            "error": str(e)
        }

@router.post("/add-missing-user-columns")
async def add_missing_user_columns(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Add missing user columns that were not included in the original migration.
    Fixes: column users.joined_org_at does not exist
    """
    try:
        from sqlalchemy import text

        add_columns_sql = """
        -- Add missing user columns
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS joined_org_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_users_joined_org_at ON users(joined_org_at);
        CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        """

        db.execute(text(add_columns_sql))
        db.commit()

        return {
            "status": "success",
            "message": "Successfully added missing user columns",
            "columns_added": ["joined_org_at", "last_active_at", "status"]
        }

    except Exception as e:
        db.rollback()
        return {
            "status": "error",
            "message": f"Failed to add missing user columns: {str(e)}",
            "error": str(e)
        }