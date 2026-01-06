"""
Standalone migration script to make user_id nullable.

This fixes the issue where team member records need user_id=NULL
but the database doesn't allow it.

Run this ONCE manually:
    python migrations/fix_user_id_nullable.py
"""

import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from app.core.config import settings

def main():
    """Apply the user_id nullable migration."""

    print("=" * 60)
    print("Migration: Make user_id nullable in user_correlations table")
    print("=" * 60)

    # Create engine
    engine = create_engine(settings.DATABASE_URL)

    try:
        with engine.connect() as conn:
            # Start transaction
            trans = conn.begin()

            try:
                # Step 1: Check current state
                print("\n1. Checking current state...")
                result = conn.execute(text("""
                    SELECT column_name, is_nullable, data_type
                    FROM information_schema.columns
                    WHERE table_name = 'user_correlations' AND column_name = 'user_id'
                """))
                row = result.fetchone()
                user_id_already_nullable = False
                if row:
                    print(f"   Current: user_id is_nullable = {row[1]}")
                    if row[1] == 'YES':
                        print("   ✅ user_id is already nullable")
                        user_id_already_nullable = True
                    else:
                        print("   ⚠️  user_id is NOT nullable")
                else:
                    print("   ❌ Could not find user_id column!")
                    return

                # Step 2: Remove problematic unique constraints on jira_account_id and linear_user_id
                print("\n2. Checking for problematic unique constraints...")

                # Check for uq_jira_account_id constraint
                result = conn.execute(text("""
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'user_correlations'::regclass
                    AND conname = 'uq_jira_account_id'
                """))
                if result.fetchone():
                    print("   Removing uq_jira_account_id constraint...")
                    conn.execute(text("""
                        ALTER TABLE user_correlations DROP CONSTRAINT IF EXISTS uq_jira_account_id;
                    """))
                    print("   ✅ Removed uq_jira_account_id")
                else:
                    print("   ℹ️  uq_jira_account_id doesn't exist")

                # Check for uq_linear_user_id constraint
                result = conn.execute(text("""
                    SELECT conname FROM pg_constraint
                    WHERE conrelid = 'user_correlations'::regclass
                    AND conname = 'uq_linear_user_id'
                """))
                if result.fetchone():
                    print("   Removing uq_linear_user_id constraint...")
                    conn.execute(text("""
                        ALTER TABLE user_correlations DROP CONSTRAINT IF EXISTS uq_linear_user_id;
                    """))
                    print("   ✅ Removed uq_linear_user_id")
                else:
                    print("   ℹ️  uq_linear_user_id doesn't exist")

                # Step 3: Make user_id nullable (if needed)
                if not user_id_already_nullable:
                    print("\n3. Making user_id nullable...")
                    conn.execute(text("""
                        ALTER TABLE user_correlations
                        ALTER COLUMN user_id DROP NOT NULL;
                    """))
                    print("   ✅ Done")
                else:
                    print("\n3. Skipping user_id nullable (already done)")

                # Step 4: Add unique constraint for org-scoped data
                print("\n4. Adding unique constraint for org-scoped team data...")

                # Check if constraint already exists
                result = conn.execute(text("""
                    SELECT indexname
                    FROM pg_indexes
                    WHERE tablename = 'user_correlations'
                    AND indexname = 'uq_user_correlations_org_email_null_user'
                """))

                if result.fetchone():
                    print("   ⚠️  Constraint already exists, skipping")
                else:
                    conn.execute(text("""
                        CREATE UNIQUE INDEX uq_user_correlations_org_email_null_user
                        ON user_correlations(organization_id, email)
                        WHERE user_id IS NULL;
                    """))
                    print("   ✅ Done")

                # Step 5: Verify changes
                print("\n5. Verifying changes...")
                result = conn.execute(text("""
                    SELECT column_name, is_nullable, data_type
                    FROM information_schema.columns
                    WHERE table_name = 'user_correlations' AND column_name = 'user_id'
                """))
                row = result.fetchone()
                if row and row[1] == 'YES':
                    print(f"   ✅ user_id is now nullable: {row[1]}")
                else:
                    print(f"   ❌ Failed to make nullable: {row[1]}")
                    raise Exception("Migration verification failed")

                # Check constraints
                result = conn.execute(text("""
                    SELECT conname, pg_get_constraintdef(oid) as definition
                    FROM pg_constraint
                    WHERE conrelid = 'user_correlations'::regclass
                    ORDER BY conname
                """))

                print("\n   Constraints on user_correlations:")
                for row in result:
                    print(f"   - {row[0]}: {row[1][:80]}...")

                # Commit transaction
                trans.commit()
                print("\n" + "=" * 60)
                print("✅ Migration completed successfully!")
                print("=" * 60)
                print("\nNext steps:")
                print("1. Restart your backend server")
                print("2. Try the sync operation again")
                print()

            except Exception as e:
                trans.rollback()
                print(f"\n❌ Error during migration: {e}")
                print("   Transaction rolled back - no changes made")
                raise

    except Exception as e:
        print(f"\n❌ Failed to connect to database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
