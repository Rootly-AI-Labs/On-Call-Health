"""
Script to assign an existing analysis to a user.
Takes an analysis ID and user ID, and creates a copy of that analysis for the user.

Usage:
    python assign_analysis_to_user.py --analysis-id 12 --user-id 5 --dry-run     # Preview changes
    python assign_analysis_to_user.py --analysis-id 12 --user-id 5 --apply      # Apply changes
"""
import sys
import os
import argparse
from datetime import datetime
from pathlib import Path

# Set DATABASE_URL in environment BEFORE importing models
if not os.getenv("DATABASE_URL"):
    # Try to load from .env file if available
    from dotenv import load_dotenv
    load_dotenv()

# Add the app directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.models.base import SessionLocal
from app.models.user import User
from app.models.analysis import Analysis


def fetch_analysis(db, analysis_id: int) -> Analysis:
    """Fetch an analysis by ID."""
    print(f"[*] Fetching analysis with ID: {analysis_id}")

    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()

    if not analysis:
        print(f"[ERROR] Analysis with ID {analysis_id} not found")
        sys.exit(1)

    print(f"[OK] Found analysis: {analysis}")
    return analysis


def fetch_user(db, user_id: int) -> User:
    """Fetch a user by ID."""
    print(f"[*] Fetching user with ID: {user_id}")

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        print(f"[ERROR] User with ID {user_id} not found")
        sys.exit(1)

    print(f"[OK] Found user: {user.email}")
    return user


def user_already_has_analysis(db, user_id: int, analysis_id: int) -> bool:
    """Check if user already has this analysis assigned."""
    existing = db.query(Analysis).filter(
        Analysis.user_id == user_id,
        Analysis.id == analysis_id
    ).first()

    return existing is not None


def assign_analysis_to_user(db, source_analysis: Analysis, target_user: User, dry_run: bool = True) -> bool:
    """
    Assign an existing analysis to a user by creating a copy.

    Args:
        db: Database session
        source_analysis: The analysis to copy
        target_user: The user to assign the analysis to
        dry_run: If True, don't actually create the analysis

    Returns:
        True if analysis was assigned (or would be assigned in dry-run), False if skipped
    """
    # Check if user already has this analysis
    if user_already_has_analysis(db, target_user.id, source_analysis.id):
        print(f"  [SKIP] User {target_user.id} ({target_user.email}) already has analysis {source_analysis.id}")
        return False

    if dry_run:
        print(f"  [DRY-RUN] Would assign analysis {source_analysis.id} to user {target_user.id} ({target_user.email})")
        print(f"    - Integration: {source_analysis.integration_name}")
        print(f"    - Platform: {source_analysis.platform}")
        print(f"    - Status: {source_analysis.status}")
        print(f"    - Time range: {source_analysis.time_range} days")
        return True

    # Create a copy of the analysis for the target user
    try:
        new_analysis = Analysis(
            user_id=target_user.id,
            organization_id=target_user.organization_id if hasattr(target_user, 'organization_id') else None,
            rootly_integration_id=source_analysis.rootly_integration_id,
            integration_name=source_analysis.integration_name,
            platform=source_analysis.platform,
            time_range=source_analysis.time_range,
            status=source_analysis.status,
            config=source_analysis.config.copy() if source_analysis.config else None,
            results=source_analysis.results.copy() if source_analysis.results else None,
            error_message=source_analysis.error_message,
            completed_at=source_analysis.completed_at
        )

        db.add(new_analysis)
        db.flush()  # Flush to get the ID without committing

        print(f"  [OK] Assigned analysis {source_analysis.id} -> {new_analysis.id} to user {target_user.id} ({target_user.email})")
        return True

    except Exception as e:
        print(f"  [ERROR] Failed to assign analysis to user {target_user.id}: {str(e)}")
        raise


def main():
    """Main function to assign an analysis to a user."""
    parser = argparse.ArgumentParser(description='Assign an existing analysis to a user')
    parser.add_argument('--analysis-id', type=int, required=True, help='ID of the analysis to assign')
    parser.add_argument('--user-id', type=int, required=True, help='ID of the user to assign the analysis to')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without applying')
    parser.add_argument('--apply', action='store_true', help='Apply changes to database')
    args = parser.parse_args()

    # Require either --dry-run or --apply
    if not args.dry_run and not args.apply:
        print("[ERROR] Please specify either --dry-run or --apply")
        parser.print_help()
        sys.exit(1)

    if args.apply and args.dry_run:
        print("[ERROR] Cannot specify both --dry-run and --apply")
        sys.exit(1)

    # Create database session
    print("[*] Connecting to database...")
    db = SessionLocal()

    try:
        # Fetch the analysis and user
        source_analysis = fetch_analysis(db, args.analysis_id)
        target_user = fetch_user(db, args.user_id)

        # Summary
        print(f"\n{'='*60}")
        print(f"{'DRY RUN MODE' if args.dry_run else 'APPLY MODE'}")
        print(f"{'='*60}")
        print(f"Analysis ID: {args.analysis_id}")
        print(f"User ID: {args.user_id}")
        print(f"{'='*60}\n")

        if args.apply:
            response = input("Are you sure you want to assign this analysis? (yes/no): ")
            if response.lower() != 'yes':
                print("[*] Cancelled by user")
                return

        # Assign the analysis
        print("[*] Processing...\n")
        if assign_analysis_to_user(db, source_analysis, target_user, dry_run=args.dry_run):
            assigned = True
        else:
            assigned = False

        # Commit if applying
        if args.apply:
            print("\n[*] Committing changes to database...")
            db.commit()
            print("[OK] Changes committed successfully")

        # Summary
        print(f"\n{'='*60}")
        print(f"SUMMARY")
        print(f"{'='*60}")
        if assigned:
            print(f"{'Would assign' if args.dry_run else 'Assigned'}: analysis {args.analysis_id} to user {args.user_id}")
        else:
            print(f"Skipped: User already has this analysis")
        print(f"{'='*60}\n")

        if args.dry_run:
            print("[*] This was a dry run. No changes were made.")
            print("[*] Run with --apply to assign the analysis.")
        else:
            print("[OK] Analysis assigned successfully!")

    except Exception as e:
        print(f"\n[ERROR] An error occurred: {str(e)}")
        import traceback
        traceback.print_exc()

        if args.apply:
            print("[*] Rolling back changes...")
            db.rollback()
            print("[OK] Changes rolled back")

        sys.exit(1)

    finally:
        db.close()
        print("[*] Database connection closed")


if __name__ == "__main__":
    main()
