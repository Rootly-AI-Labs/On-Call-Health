"""
One-time script to export analysis data from local PostgreSQL database to JSON.
This exports analysis ID 12 and all related data for use as demo/mock data.
"""
import json
import sys
import os
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Load environment variables from .env file
load_dotenv()

# Get DATABASE_URL from environment variable
DATABASE_URL = os.getenv("DATABASE_URL")

# Validate that DATABASE_URL is set
if not DATABASE_URL:
    print("[ERROR] DATABASE_URL environment variable not set")
    print("Please set it in your .env file or export it:")
    print("  export DATABASE_URL=postgresql://postgres:<password>@localhost:5432/burnout_detector")
    sys.exit(1)

# Set DATABASE_URL in environment for importing models
# This prevents the config from throwing an error
os.environ["DATABASE_URL"] = DATABASE_URL

# Add the app directory to the Python path
sys.path.append(str(Path(__file__).parent))

from app.models.analysis import Analysis
from app.models.integration_mapping import IntegrationMapping
from app.models.user_burnout_report import UserBurnoutReport

def datetime_serializer(obj):
    """JSON serializer for datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

def export_analysis(analysis_id: int, output_file: str = "mock_analysis_data.json"):
    """
    Export analysis and related data to JSON file.

    Args:
        analysis_id: The ID of the analysis to export
        output_file: Name of the output JSON file
    """
    # Mask password in output
    masked_url = DATABASE_URL.split("://")[0] + "://***:***@" + DATABASE_URL.split("@")[1] if "@" in DATABASE_URL else "***"
    print(f"[*] Connecting to database: {masked_url}")

    # Create database connection
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        # Fetch the analysis
        print(f"[*] Fetching analysis with ID: {analysis_id}")
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()

        if not analysis:
            print(f"[ERROR] Analysis with ID {analysis_id} not found")
            return False

        print(f"[OK] Found analysis: {analysis.uuid}")
        print(f"   Status: {analysis.status}")
        print(f"   User ID: {analysis.user_id}")
        print(f"   Created: {analysis.created_at}")

        # Fetch related integration mappings
        print(f"[*] Fetching related integration mappings...")
        mappings = db.query(IntegrationMapping).filter(
            IntegrationMapping.analysis_id == analysis_id
        ).all()

        print(f"   Found {len(mappings)} integration mappings")

        # Fetch related user burnout reports
        print(f"[*] Fetching related user burnout reports...")
        burnout_reports = db.query(UserBurnoutReport).filter(
            UserBurnoutReport.user_id == analysis.user_id
        ).all()

        print(f"   Found {len(burnout_reports)} burnout reports")

        # Build the export data structure
        export_data = {
            "analysis": {
                "id": analysis.id,
                "uuid": analysis.uuid,
                "user_id": analysis.user_id,
                "rootly_integration_id": analysis.rootly_integration_id,
                "organization_id": analysis.organization_id,
                "integration_name": analysis.integration_name,
                "platform": analysis.platform,
                "time_range": analysis.time_range,
                "status": analysis.status,
                "config": analysis.config,
                "results": analysis.results,
                "error_message": analysis.error_message,
                "created_at": analysis.created_at,
                "completed_at": analysis.completed_at,
            },
            "integration_mappings": [
                {
                    "id": mapping.id,
                    "user_id": mapping.user_id,
                    "analysis_id": mapping.analysis_id,
                    "source_platform": mapping.source_platform,
                    "source_identifier": mapping.source_identifier,
                    "target_platform": mapping.target_platform,
                    "target_identifier": mapping.target_identifier,
                    "mapping_successful": mapping.mapping_successful,
                    "mapping_method": mapping.mapping_method,
                    "error_message": mapping.error_message,
                    "data_collected": mapping.data_collected,
                    "data_points_count": mapping.data_points_count,
                    "created_at": mapping.created_at,
                    "updated_at": mapping.updated_at,
                }
                for mapping in mappings
            ],
            "user_burnout_reports": [
                {
                    "id": report.id,
                    "user_id": report.user_id,
                    "organization_id": report.organization_id,
                    "email": report.email,
                    "email_domain": report.email_domain,
                    "analysis_id": report.analysis_id,
                    "feeling_score": report.feeling_score,
                    "workload_score": report.workload_score,
                    "stress_factors": report.stress_factors,
                    "personal_circumstances": report.personal_circumstances,
                    "additional_comments": report.additional_comments,
                    "submitted_via": report.submitted_via,
                    "is_anonymous": report.is_anonymous,
                    "submitted_at": report.submitted_at,
                    "updated_at": report.updated_at,
                }
                for report in burnout_reports
            ],
            "metadata": {
                "exported_at": datetime.now(),
                "source_database": masked_url,  # Password masked
                "original_analysis_id": analysis_id,
            }
        }

        # Write to JSON file
        output_path = Path(__file__).parent / output_file
        print(f"[*] Writing data to: {output_path}")

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, default=datetime_serializer)

        print(f"[OK] Successfully exported analysis to {output_file}")
        print(f"[*] Export contains:")
        print(f"   - 1 analysis record")
        print(f"   - {len(mappings)} integration mapping records")
        print(f"   - {len(burnout_reports)} user burnout report records")

        # Print summary of analysis results
        if analysis.results:
            print(f"\n[*] Analysis Results Summary:")
            if isinstance(analysis.results, dict):
                if "team_scores" in analysis.results:
                    team_scores = analysis.results["team_scores"]
                    print(f"   Team Scores: {json.dumps(team_scores, indent=4)}")
                if "members" in analysis.results:
                    print(f"   Number of members: {len(analysis.results['members'])}")

        return True

    except Exception as e:
        print(f"[ERROR] Error during export: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        db.close()
        print("[*] Database connection closed")

if __name__ == "__main__":
    # Export analysis ID 421 which includes user_id 1
    # This will also export all health check-ins (user_burnout_reports) for user_id 1
    print("[*] Exporting analysis ID 421 with all health check-ins for user_id 1...")
    print("[*] The export_analysis function will:")
    print("   1. Export the analysis record")
    print("   2. Export all integration mappings for this analysis")
    print("   3. Collect and export ALL user_burnout_reports (health check-ins) for user_id 1")
    print()

    success = export_analysis(
        analysis_id=421,
        output_file="new_mock_analysis_data.json"
    )

    if success:
        print("\n[OK] Export completed successfully!")
        print("You can now use this JSON file to create demo analyses for new users.")
    else:
        print("\n[ERROR] Export failed!")
        sys.exit(1)
