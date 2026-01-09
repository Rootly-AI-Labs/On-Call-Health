"""
One-time migration script to load demo analysis data for all users.
This creates a completed demo analysis for each user using the mock data exported from analysis ID 12.

Usage:
    python load_demo_analyses.py --dry-run    # Preview changes
    python load_demo_analyses.py --apply      # Apply changes
"""
import json
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


def load_mock_data(json_path: str) -> dict:
    """Load mock analysis data from JSON file."""
    print(f"[*] Loading mock data from: {json_path}")

    if not os.path.exists(json_path):
        print(f"[ERROR] Mock data file not found: {json_path}")
        sys.exit(1)

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"[OK] Mock data loaded successfully")
    return data


def has_demo_analysis(db, user_id: int) -> bool:
    """Check if user already has a demo analysis."""
    # Get all analyses for this user and check in Python
    # This is more reliable than complex JSON queries
    user_analyses = db.query(Analysis).filter(
        Analysis.user_id == user_id
    ).all()

    for analysis in user_analyses:
        if analysis.config and isinstance(analysis.config, dict):
            if analysis.config.get('is_demo') is True:
                return True

    return False


def create_demo_analysis(db, user: User, mock_data: dict, dry_run: bool = True) -> bool:
    """
    Create a demo analysis for the given user.

    Args:
        db: Database session
        user: User object
        mock_data: Mock analysis data loaded from JSON
        dry_run: If True, don't actually create the analysis

    Returns:
        True if analysis was created (or would be created in dry-run), False if skipped
    """
    # Check if user already has a demo analysis
    if has_demo_analysis(db, user.id):
        print(f"  [SKIP] User {user.id} ({user.email}) already has a demo analysis")
        return False

    # Prepare the analysis data
    original_analysis = mock_data['analysis']

    # Create config with demo marker
    config = original_analysis.get('config', {}).copy()
    config['is_demo'] = True
    config['demo_created_at'] = datetime.now().isoformat()

    if dry_run:
        print(f"  [DRY-RUN] Would create demo analysis for user {user.id} ({user.email})")
        print(f"    - Integration: {original_analysis.get('integration_name', 'Demo')}")
        print(f"    - Platform: {original_analysis.get('platform', 'N/A')}")
        print(f"    - Status: completed")
        print(f"    - Time range: {original_analysis.get('time_range', 30)} days")
        if original_analysis.get('results'):
            results = original_analysis['results']
            if 'metadata' in results:
                print(f"    - Total users in analysis: {results['metadata'].get('total_users', 'N/A')}")
            if 'team_health' in results:
                print(f"    - Team health score: {results['team_health'].get('overall_score', 'N/A')}")
        return True

    # Create the analysis
    try:
        analysis = Analysis(
            user_id=user.id,
            organization_id=user.organization_id if hasattr(user, 'organization_id') else None,
            rootly_integration_id=None,  # Demo analysis doesn't need real integration
            integration_name=f"Demo Analysis",
            platform=original_analysis.get('platform', 'pagerduty'),
            time_range=original_analysis.get('time_range', 30),
            status="completed",
            config=config,
            results=original_analysis.get('results'),
            error_message=None,
            completed_at=datetime.now()
        )

        db.add(analysis)
        db.flush()  # Flush to get the ID without committing

        print(f"  [OK] Created demo analysis {analysis.id} for user {user.id} ({user.email})")
        return True

    except Exception as e:
        print(f"  [ERROR] Failed to create analysis for user {user.id}: {str(e)}")
        raise


def main():
    """Main function to load demo analyses for all users."""
    parser = argparse.ArgumentParser(description='Load demo analysis data for all users')
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

    # Determine paths
    script_dir = Path(__file__).parent
    mock_data_path = script_dir / "mock_analysis_data.json"

    # Load mock data
    mock_data = load_mock_data(str(mock_data_path))

    # Create database session
    print("[*] Connecting to database...")
    db = SessionLocal()

    try:
        # Get all users
        print("[*] Fetching all users...")
        users = db.query(User).all()
        print(f"[OK] Found {len(users)} users")

        if len(users) == 0:
            print("[WARN] No users found in database")
            return

        # Summary
        print(f"\n{'='*60}")
        print(f"{'DRY RUN MODE' if args.dry_run else 'APPLY MODE'}")
        print(f"{'='*60}")
        print(f"Users to process: {len(users)}")
        print(f"Mock data source: {mock_data_path.name}")
        print(f"{'='*60}\n")

        if args.apply:
            response = input("Are you sure you want to create demo analyses? (yes/no): ")
            if response.lower() != 'yes':
                print("[*] Cancelled by user")
                return

        # Process each user
        created_count = 0
        skipped_count = 0

        print("[*] Processing users...\n")
        for user in users:
            if create_demo_analysis(db, user, mock_data, dry_run=args.dry_run):
                created_count += 1
            else:
                skipped_count += 1

        # Commit if applying
        if args.apply:
            print("\n[*] Committing changes to database...")
            db.commit()
            print("[OK] Changes committed successfully")

        # Summary
        print(f"\n{'='*60}")
        print(f"SUMMARY")
        print(f"{'='*60}")
        print(f"{'Would create' if args.dry_run else 'Created'}: {created_count} demo analyses")
        print(f"Skipped (already have demo): {skipped_count} users")
        print(f"Total users processed: {len(users)}")
        print(f"{'='*60}\n")

        if args.dry_run:
            print("[*] This was a dry run. No changes were made.")
            print("[*] Run with --apply to create the demo analyses.")
        else:
            print("[OK] Demo analyses loaded successfully!")

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


"""

  python assign_analysis_to_user.py --analysis-id 612 --user-id 46 --dry-run

  python assign_analysis_to_user.py --analysis-id 612 --user-id 16 --apply

"""

