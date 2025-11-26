"""
Burnout analysis API endpoints.
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...models import get_db, User, Analysis, RootlyIntegration, UserCorrelation, JiraIntegration
from ...auth.dependencies import get_current_active_user
from ...core.rootly_client import RootlyAPIClient
from ...services.unified_burnout_analyzer import UnifiedBurnoutAnalyzer
from ...services.github_only_burnout_analyzer import GitHubOnlyBurnoutAnalyzer
from ...services.slack_token_service import get_slack_token_for_user, SlackTokenService
from ...core.rate_limiting import analysis_rate_limit
from ...core.input_validation import AnalysisRequest as ValidatedAnalysisRequest

logger = logging.getLogger(__name__)
router = APIRouter()

class AnalysisRequest(BaseModel):
    days_back: int = 30
    include_weekends: bool = True
    integration_id: Optional[int] = None  # If not provided, use default integration

class GitHubOnlyAnalysisRequest(BaseModel):
    days_back: int = 30
    team_emails: Optional[list] = None  # If not provided, will discover from mappings

class AnalysisResponse(BaseModel):
    analysis_id: int
    status: str
    message: str

@router.post("/start", response_model=AnalysisResponse)
@analysis_rate_limit("analysis_create")
async def start_analysis(
    req: Request,
    request: ValidatedAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Start a new burnout analysis."""
    
    # Get the integration to use
    if request.integration_id:
        # Use specified integration
        integration = db.query(RootlyIntegration).filter(
            RootlyIntegration.id == request.integration_id,
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.is_active == True
        ).first()
        
        if not integration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Integration not found"
            )
    else:
        # Use default integration
        integration = db.query(RootlyIntegration).filter(
            RootlyIntegration.user_id == current_user.id,
            RootlyIntegration.is_active == True,
            RootlyIntegration.is_default == True
        ).first()
        
        if not integration:
            # Fallback to any active integration
            integration = db.query(RootlyIntegration).filter(
                RootlyIntegration.user_id == current_user.id,
                RootlyIntegration.is_active == True
            ).first()
        
        if not integration:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No Rootly integration found. Please add a Rootly integration first."
            )
    
    # Create analysis record
    analysis = Analysis(
        user_id=current_user.id,
        rootly_integration_id=integration.id,
        status="pending",
        config={
            "days_back": request.days_back,
            "include_weekends": request.include_weekends,
            "integration_name": integration.name,
            "organization_name": integration.organization_name
        }
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    
    # Start analysis in background
    background_tasks.add_task(
        run_analysis_task,
        analysis.id,
        integration.id,
        request.days_back,
        current_user.id  # Pass user ID for LLM token access
    )
    
    return AnalysisResponse(
        analysis_id=analysis.id,
        status="started",
        message=f"Analysis started using '{integration.name}'. This usually takes 2-3 minutes for {request.days_back} days of data."
    )

@router.get("/{analysis_id}")
async def get_analysis_status(
    analysis_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get analysis status and progress."""
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )
    
    response = {
        "id": analysis.id,
        "status": analysis.status,
        "created_at": analysis.created_at,
        "completed_at": analysis.completed_at,
        "config": analysis.config
    }
    
    if analysis.error_message:
        response["error"] = analysis.error_message
    
    if analysis.results:
        response["results_summary"] = {
            "total_users": len(analysis.results.get("team_analysis", [])),
            "high_risk_count": len([
                u for u in analysis.results.get("team_analysis", [])
                if u.get("risk_level") == "high"
            ]),
            "team_average_score": analysis.results.get("team_summary", {}).get("average_score")
        }
    
    return response

@router.get("/{analysis_id}/results")
async def get_analysis_results(
    analysis_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get complete analysis results."""
    analysis = db.query(Analysis).filter(
        Analysis.id == analysis_id,
        Analysis.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )
    
    if analysis.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Analysis not completed yet. Current status: {analysis.status}"
        )
    
    return analysis.results

@router.get("/current")
async def get_current_analysis(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get the most recent analysis for the user."""
    analysis = db.query(Analysis).filter(
        Analysis.user_id == current_user.id
    ).order_by(Analysis.created_at.desc()).first()
    
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analyses found"
        )
    
    response = {
        "id": analysis.id,
        "status": analysis.status,
        "created_at": analysis.created_at,
        "completed_at": analysis.completed_at,
        "config": analysis.config
    }
    
    if analysis.status == "completed" and analysis.results:
        response["results"] = analysis.results
    elif analysis.error_message:
        response["error"] = analysis.error_message
    
    return response

@router.get("/history")
async def get_analysis_history(
    limit: int = 10,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user's analysis history."""
    analyses = db.query(Analysis).filter(
        Analysis.user_id == current_user.id
    ).order_by(Analysis.created_at.desc()).limit(limit).all()
    
    return [
        {
            "id": analysis.id,
            "status": analysis.status,
            "created_at": analysis.created_at,
            "completed_at": analysis.completed_at,
            "config": analysis.config,
            "has_results": bool(analysis.results)
        }
        for analysis in analyses
    ]

@router.post("/github-only", response_model=AnalysisResponse)
async def start_github_only_analysis(
    request: GitHubOnlyAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Start a GitHub-only burnout analysis when no incident data is available."""
    
    # Check for GitHub integration
    from ...models import GitHubIntegration
    github_integration = db.query(GitHubIntegration).filter(
        GitHubIntegration.user_id == current_user.id,
        GitHubIntegration.github_token.isnot(None)
    ).first()
    
    if not github_integration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No GitHub integration found. Please connect your GitHub account first."
        )
    
    # Create analysis record with GitHub-only flag
    analysis = Analysis(
        user_id=current_user.id,
        rootly_integration_id=None,  # No Rootly integration for GitHub-only
        status="pending",
        config={
            "days_back": request.days_back,
            "analysis_type": "github_only",
            "team_emails": request.team_emails,
            "include_weekends": True
        }
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    
    # Start GitHub-only analysis in background
    background_tasks.add_task(
        run_github_only_analysis_task,
        analysis.id,
        request.days_back,
        request.team_emails,
        current_user.id
    )
    
    return AnalysisResponse(
        analysis_id=analysis.id,
        status="started",
        message=f"GitHub-only analysis started for {request.days_back} days. This usually takes 1-2 minutes."
    )

async def run_analysis_task(analysis_id: int, integration_id: int, days_back: int, user_id: int):
    """Background task to run the actual analysis."""
    db = next(get_db())
    
    try:
        # Set a timeout for the entire analysis (5 minutes)
        async def run_with_timeout():
            return await asyncio.wait_for(_run_analysis_task_impl(db, analysis_id, integration_id, days_back, user_id), timeout=300)
        
        await run_with_timeout()
        
    except asyncio.TimeoutError:
        logger.error(f"Analysis {analysis_id} timed out after 5 minutes")
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if analysis:
            analysis.status = "failed"
            analysis.error_message = "Analysis timed out after 5 minutes. This may be due to too much data or API rate limits."
            db.commit()
    except Exception as e:
        logger.error(f"Analysis {analysis_id} failed: {str(e)}", exc_info=True)
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if analysis:
            analysis.status = "failed"
            analysis.error_message = str(e)
            db.commit()
    finally:
        db.close()

async def _run_analysis_task_impl(db, analysis_id: int, integration_id: int, days_back: int, user_id: int):
    """Implementation of the analysis task."""
    try:
        logger.info(f"🔍 ANALYSIS TASK: Starting analysis {analysis_id} for user {user_id} with updated Jira correlation code")

        # Update status to running
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        analysis.status = "running"
        db.commit()
        
        # Get the integration
        integration = db.query(RootlyIntegration).filter(RootlyIntegration.id == integration_id).first()
        if not integration:
            raise Exception(f"Integration with ID {integration_id} not found")
        
        # Update last_used_at
        integration.last_used_at = datetime.now()
        db.commit()
        
        # Get user for LLM token access and check available integrations
        user = db.query(User).filter(User.id == user_id).first()
        has_llm_token = user and user.llm_token and user.llm_provider

        # Check for GitHub integration
        from ...models import GitHubIntegration
        github_integration = db.query(GitHubIntegration).filter(
            GitHubIntegration.user_id == user_id,
            GitHubIntegration.github_token.isnot(None)
        ).first()
        has_github = bool(github_integration)

        # Get Slack OAuth token and feature config for this user's organization
        slack_token = None
        slack_service = SlackTokenService(db)
        if user:
            feature_config = slack_service.get_feature_config_for_user(user)

            # Only retrieve token if communication patterns analysis is enabled
            if feature_config and feature_config.communication_patterns_enabled:
                slack_token = slack_service.get_oauth_token_for_user(user)
                if slack_token:
                    logger.info(
                        f"Retrieved Slack OAuth token for user {user_id} (org {user.organization_id}) "
                        f"- communication patterns analysis enabled"
                    )
                else:
                    logger.warning(f"Communication patterns enabled but no Slack token available for user {user_id}")
            else:
                logger.debug(
                    f"Slack communication patterns analysis not enabled for user {user_id} "
                    f"(survey: {feature_config.survey_enabled if feature_config else 'N/A'})"
                )

        # Check for Jira integration
        jira_integration = db.query(JiraIntegration).filter(
            JiraIntegration.user_id == user_id,
            JiraIntegration.access_token.isnot(None)
        ).first()
        has_jira = bool(jira_integration)
        if has_jira:
            logger.info(f"Jira integration found for user {user_id}")

        # Attempt to collect incident data to determine if GitHub-only analysis is needed
        incident_data_available = False
        try:
            logger.info(f"Testing incident data availability for integration '{integration.name}'")
            client = RootlyAPIClient(integration.api_token)
            test_data = await client.collect_analysis_data(days_back=1)  # Quick test with 1 day
            
            # Check if we got meaningful incident data
            incidents = test_data.get("incidents", [])
            users = test_data.get("users", [])
            metadata = test_data.get("collection_metadata", {})
            
            # Check for various failure conditions that should trigger GitHub-only fallback
            connection_failed = (
                metadata.get("connection_failed", False) or
                metadata.get("error", "").startswith("Connection test failed") or
                "HTTP 401" in metadata.get("error", "") or
                "HTTP 403" in metadata.get("error", "")
            )
            
            # Only consider incident data available if we have meaningful data
            incident_data_available = (
                len(users) > 0 and 
                not connection_failed and
                not metadata.get("incidents_api_failed", False)
            )
            
            logger.info(f"Incident data test: {len(incidents)} incidents, {len(users)} users, available: {incident_data_available}")
            
        except Exception as e:
            logger.warning(f"Failed to test incident data availability: {e}")
            incident_data_available = False
        
        # Determine analysis strategy
        if not incident_data_available and has_github:
            logger.info("No incident data available but GitHub integration found - using GitHub-only analysis")
            
            # Collect GitHub data for the team
            from ...services.github_collector import collect_team_github_data
            try:
                # Get team member emails from GitHub integration or user mappings
                from ...models import UserMapping
                team_emails = []
                
                # Try to get emails from user mappings
                mappings = db.query(UserMapping).filter(
                    UserMapping.user_id == user_id,
                    UserMapping.target_platform == "github"
                ).all()
                
                team_emails = [mapping.source_identifier for mapping in mappings if mapping.source_identifier]
                
                if not team_emails:
                    # Fallback: use the user's own email if available
                    if user.email:
                        team_emails = [user.email]
                    else:
                        raise Exception("No team member emails found for GitHub analysis")
                
                logger.info(f"Collecting GitHub data for {len(team_emails)} team members")
                
                # Decrypt GitHub token
                from ...api.endpoints.github import decrypt_token
                github_token = decrypt_token(github_integration.github_token)
                
                github_data = await collect_team_github_data(
                    team_emails, days_back, github_token
                )
                
                if not github_data:
                    raise Exception("No GitHub data collected for team members")
                
                # Use GitHub-only analyzer
                github_analyzer = GitHubOnlyBurnoutAnalyzer()
                results = await github_analyzer.analyze_team_burnout(
                    github_data=github_data,
                    time_range_days=days_back
                )
                
                # Add metadata to indicate this was a GitHub-only analysis
                results["analysis_type"] = "github_only"
                results["data_sources"] = ["github"]
                results["confidence_note"] = "Analysis based on GitHub activity patterns only"
                
            except Exception as e:
                logger.error(f"GitHub-only analysis failed: {e}")
                raise Exception(f"GitHub-only analysis failed: {str(e)}")
                
        else:
            logger.info(f"Using UnifiedBurnoutAnalyzer (AI={has_llm_token})")
            
            # Set user context for AI analysis if needed
            if has_llm_token:
                from ...services.ai_burnout_analyzer import set_user_context
                set_user_context(user)
                logger.info(f"Set user context for AI analysis (LLM provider: {user.llm_provider})")
            
            # Get GitHub token if available
            github_token = None
            if has_github:
                from ...api.endpoints.github import decrypt_token as decrypt_github_token
                try:
                    github_token = decrypt_github_token(github_integration.github_token)
                    logger.info(f"Retrieved GitHub token for user {user_id}")
                except Exception as e:
                    logger.error(f"Failed to decrypt GitHub token: {e}")

            # Get Jira token if available
            jira_token = None
            if has_jira:
                from ...api.endpoints.jira import decrypt_jira_token
                try:
                    jira_token = decrypt_jira_token(jira_integration.access_token)
                    logger.info(f"Retrieved Jira token for user {user_id}")
                except Exception as e:
                    logger.error(f"Failed to decrypt Jira token: {e}")

            # Fetch user correlations for Jira mapping
            synced_users = []
            try:
                logger.info(f"🔍 Fetching user correlations for user_id={user_id}")
                user_correlations = db.query(UserCorrelation).filter(
                    UserCorrelation.user_id == user_id
                ).all()

                logger.info(f"🔍 Query returned {len(user_correlations)} user correlation records")

                # Format user correlations for the analyzer
                synced_users = [
                    {
                        "email": uc.email,
                        "name": uc.name,
                        "github_username": uc.github_username,
                        "slack_user_id": uc.slack_user_id,
                        "rootly_user_id": uc.rootly_user_id,
                        "jira_account_id": uc.jira_account_id,
                        "jira_email": uc.jira_email
                    }
                    for uc in user_correlations
                ]

                logger.info(f"✅ Fetched {len(synced_users)} user correlations for analysis")
                users_with_jira = [u for u in synced_users if u.get("jira_account_id")]
                if users_with_jira:
                    logger.info(f"  ✅ {len(users_with_jira)} users have Jira mapping")
                    for u in users_with_jira[:3]:  # Log first 3
                        logger.info(f"    - {u.get('name')} → jira_account_id={u.get('jira_account_id')}")
                else:
                    logger.warning(f"  ⚠️ NO users have Jira account ID mapping in user_correlations table!")
                    if synced_users:
                        logger.warning(f"  Sample user fields: {list(synced_users[0].keys())}")
            except Exception as e:
                logger.error(f"❌ Failed to fetch user correlations: {e}", exc_info=True)
                synced_users = []

            # Initialize UnifiedBurnoutAnalyzer with all available integrations
            analyzer = UnifiedBurnoutAnalyzer(
                api_token=integration.api_token,
                platform=integration.platform,
                enable_ai=has_llm_token,
                github_token=github_token,
                slack_token=slack_token,
                jira_token=jira_token,
                synced_users=synced_users,
                current_user_id=user_id
            )
            
            # Run analysis
            results = await analyzer.analyze_burnout(
                time_range_days=days_back,
                include_weekends=True,
                user_id=user.id,
                analysis_id=analysis_id
            )
        
        # Update analysis with results
        analysis.status = "completed"
        analysis.results = results
        analysis.completed_at = datetime.now()
        db.commit()
        
        logger.info(f"Analysis {analysis_id} completed successfully")
        
    except Exception as e:
        logger.error(f"Analysis {analysis_id} failed: {str(e)}", exc_info=True)
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if analysis:
            analysis.status = "failed"
            analysis.error_message = str(e)
            db.commit()
        raise

async def run_github_only_analysis_task(analysis_id: int, days_back: int, team_emails: Optional[list], user_id: int):
    """Background task to run GitHub-only burnout analysis."""
    db = next(get_db())
    
    try:
        # Update status to running
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        analysis.status = "running"
        db.commit()
        
        # Get user and GitHub integration
        user = db.query(User).filter(User.id == user_id).first()
        from ...models import GitHubIntegration
        github_integration = db.query(GitHubIntegration).filter(
            GitHubIntegration.user_id == user_id,
            GitHubIntegration.github_token.isnot(None)
        ).first()
        
        if not github_integration:
            raise Exception("GitHub integration not found")
        
        # Determine team emails to analyze
        if not team_emails:
            # Get team member emails from user mappings
            from ...models import UserMapping
            mappings = db.query(UserMapping).filter(
                UserMapping.user_id == user_id,
                UserMapping.target_platform == "github"
            ).all()
            
            team_emails = [mapping.source_identifier for mapping in mappings if mapping.source_identifier]
            
            if not team_emails:
                # Fallback: use the user's own email if available
                if user.email:
                    team_emails = [user.email]
                else:
                    raise Exception("No team member emails found for GitHub analysis")
        
        logger.info(f"Running GitHub-only analysis for {len(team_emails)} team members")
        
        # Decrypt GitHub token
        from ...api.endpoints.github import decrypt_token
        github_token = decrypt_token(github_integration.github_token)
        
        # Collect GitHub data for the team
        from ...services.github_collector import collect_team_github_data
        github_data = await collect_team_github_data(
            team_emails, days_back, github_token
        )
        
        if not github_data:
            raise Exception("No GitHub data collected for team members")
        
        # Use GitHub-only analyzer
        github_analyzer = GitHubOnlyBurnoutAnalyzer()
        results = await github_analyzer.analyze_team_burnout(
            github_data=github_data,
            time_range_days=days_back
        )
        
        # Add metadata to indicate this was a GitHub-only analysis
        results["analysis_type"] = "github_only"
        results["data_sources"] = ["github"]
        results["confidence_note"] = "Analysis based on GitHub activity patterns only"
        results["team_emails_analyzed"] = team_emails
        
        # Update analysis with results
        analysis.status = "completed"
        analysis.results = results
        analysis.completed_at = datetime.now()
        db.commit()
        
        logger.info(f"GitHub-only analysis {analysis_id} completed successfully")
        
    except Exception as e:
        logger.error(f"GitHub-only analysis {analysis_id} failed: {str(e)}", exc_info=True)
        # Update analysis with error
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if analysis:
            analysis.status = "failed"
            analysis.error_message = str(e)
            db.commit()
    
    finally:
        db.close()