"""
Configuration API endpoints for managing burnout analysis settings.
"""
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, validator
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ...models import get_db, User, Organization
from ...auth.dependencies import get_current_active_user

logger = logging.getLogger(__name__)

router = APIRouter()


# Pydantic Models
class IntegrationImpact(BaseModel):
    """Impact percentages for a single metric across integrations."""
    rootly: int = Field(ge=0, le=100, description="Rootly/PagerDuty impact percentage")
    github: int = Field(ge=0, le=100, description="GitHub impact percentage")
    slack: int = Field(ge=0, le=100, description="Slack impact percentage")

    @validator('*', pre=True)
    def validate_sum(cls, v, values):
        """Validate that the sum equals 100%."""
        if len(values) == 2:  # All three values are present
            total = sum(values.values()) + v
            if total != 100:
                logger.warning(f"Integration impact sum is {total}%, not 100%")
        return v


class CBIWeights(BaseModel):
    """Copenhagen Burnout Inventory dimension weights."""
    personal: int = Field(ge=0, le=100, description="Personal burnout weight")
    work: int = Field(ge=0, le=100, description="Work-related burnout weight")

    @validator('work')
    def validate_sum(cls, v, values):
        """Validate that weights sum to 100%."""
        if 'personal' in values:
            total = values['personal'] + v
            if total != 100:
                raise ValueError(f"CBI weights must sum to 100%, got {total}%")
        return v


class IntegrationImpacts(BaseModel):
    """Integration impact percentages for all metrics."""
    teamHealth: IntegrationImpact
    atRisk: IntegrationImpact
    workload: IntegrationImpact
    afterHours: IntegrationImpact
    weekendWork: IntegrationImpact
    responseTime: IntegrationImpact
    incidentLoad: IntegrationImpact


class ConfigurationRequest(BaseModel):
    """Request model for updating configuration."""
    cbiWeights: CBIWeights
    integrationImpacts: IntegrationImpacts
    activePreset: str = Field(default="default", description="Name of active preset")


class ConfigurationResponse(BaseModel):
    """Response model for configuration."""
    cbiWeights: CBIWeights
    integrationImpacts: IntegrationImpacts
    activePreset: str
    updated_at: Optional[str] = None
    organization_id: Optional[int] = None


# Default configuration
DEFAULT_CONFIG = {
    "cbiWeights": {
        "personal": 50,
        "work": 50
    },
    "integrationImpacts": {
        "teamHealth": {"rootly": 60, "github": 20, "slack": 20},
        "atRisk": {"rootly": 90, "github": 10, "slack": 0},
        "workload": {"rootly": 100, "github": 0, "slack": 0},
        "afterHours": {"rootly": 60, "github": 25, "slack": 15},
        "weekendWork": {"rootly": 65, "github": 25, "slack": 10},
        "responseTime": {"rootly": 100, "github": 0, "slack": 0},
        "incidentLoad": {"rootly": 100, "github": 0, "slack": 0}
    },
    "activePreset": "default"
}


@router.get("", response_model=ConfigurationResponse)
async def get_configuration(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get the current configuration for the user's organization.
    Returns default configuration if none is set. Creates a personal organization if needed.
    """
    try:
        # Get or create user's organization
        organization = None
        if current_user.organization_id:
            organization = db.query(Organization).filter(
                Organization.id == current_user.organization_id
            ).first()

        # If user has no organization or it doesn't exist, create a personal one
        if not organization:
            logger.info(f"Creating personal organization for user {current_user.id}")
            organization = Organization(
                name=f"{current_user.email}'s Organization",
                domain=current_user.email.split('@')[1] if '@' in current_user.email else "personal",
                slug=f"personal-{current_user.id}",
                plan_type="free",
                status="active",
                settings={"burnout_config": DEFAULT_CONFIG}
            )
            db.add(organization)
            db.flush()  # Get the organization ID

            # Update user's organization_id
            current_user.organization_id = organization.id
            db.commit()
            db.refresh(organization)
            logger.info(f"Created organization {organization.id} for user {current_user.id}")

        # Get configuration from organization settings
        settings = organization.settings or {}
        config = settings.get("burnout_config", DEFAULT_CONFIG)

        # Ensure all required fields are present
        config = {**DEFAULT_CONFIG, **config}

        # Fix legacy data: if CBI weights don't sum to 100%, reset to defaults
        cbi_sum = config.get("cbiWeights", {}).get("personal", 0) + config.get("cbiWeights", {}).get("work", 0)
        if cbi_sum != 100:
            logger.warning(f"CBI weights sum to {cbi_sum}%, resetting to defaults")
            config["cbiWeights"] = DEFAULT_CONFIG["cbiWeights"]

        logger.info(f"Retrieved configuration for organization {organization.id}")
        return ConfigurationResponse(
            **config,
            organization_id=organization.id,
            updated_at=organization.updated_at.isoformat() if organization.updated_at else None
        )

    except Exception as e:
        logger.error(f"Error retrieving configuration: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving configuration: {str(e)}"
        )


@router.put("", response_model=ConfigurationResponse)
async def update_configuration(
    config_request: ConfigurationRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Update the configuration for the user's organization.
    Creates a personal organization if the user doesn't have one.
    """
    try:
        # Get or create user's organization
        organization = None
        if current_user.organization_id:
            organization = db.query(Organization).filter(
                Organization.id == current_user.organization_id
            ).first()

        # If user has no organization or it doesn't exist, create a personal one
        if not organization:
            logger.info(f"Creating personal organization for user {current_user.id}")
            organization = Organization(
                name=f"{current_user.email}'s Organization",
                domain=current_user.email.split('@')[1] if '@' in current_user.email else "personal",
                slug=f"personal-{current_user.id}",
                plan_type="free",
                status="active",
                settings={}
            )
            db.add(organization)
            db.flush()  # Get the organization ID

            # Update user's organization_id
            current_user.organization_id = organization.id
            db.commit()
            db.refresh(organization)
            logger.info(f"Created organization {organization.id} for user {current_user.id}")

        # Get existing settings or initialize
        settings = organization.settings or {}

        # Update burnout configuration
        settings["burnout_config"] = config_request.dict()

        # Save to database - mark the JSON field as modified so SQLAlchemy detects the change
        organization.settings = settings
        flag_modified(organization, "settings")
        db.commit()
        db.refresh(organization)

        logger.info(f"Updated configuration for organization {organization.id}")

        return ConfigurationResponse(
            **config_request.dict(),
            organization_id=organization.id,
            updated_at=organization.updated_at.isoformat() if organization.updated_at else None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating configuration: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating configuration: {str(e)}"
        )


@router.post("/reset", response_model=ConfigurationResponse)
async def reset_configuration(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Reset the configuration to default values.
    Creates a personal organization if the user doesn't have one.
    """
    try:
        # Get or create user's organization
        organization = None
        if current_user.organization_id:
            organization = db.query(Organization).filter(
                Organization.id == current_user.organization_id
            ).first()

        # If user has no organization or it doesn't exist, create a personal one
        if not organization:
            logger.info(f"Creating personal organization for user {current_user.id}")
            organization = Organization(
                name=f"{current_user.email}'s Organization",
                domain=current_user.email.split('@')[1] if '@' in current_user.email else "personal",
                slug=f"personal-{current_user.id}",
                plan_type="free",
                status="active",
                settings={}
            )
            db.add(organization)
            db.flush()

            # Update user's organization_id
            current_user.organization_id = organization.id
            db.commit()
            db.refresh(organization)
            logger.info(f"Created organization {organization.id} for user {current_user.id}")

        # Reset to default configuration
        settings = organization.settings or {}
        settings["burnout_config"] = DEFAULT_CONFIG

        # Mark the JSON field as modified so SQLAlchemy detects the change
        organization.settings = settings
        flag_modified(organization, "settings")
        db.commit()
        db.refresh(organization)

        logger.info(f"Reset configuration to defaults for organization {organization.id}")

        return ConfigurationResponse(
            **DEFAULT_CONFIG,
            organization_id=organization.id,
            updated_at=organization.updated_at.isoformat() if organization.updated_at else None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting configuration: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error resetting configuration: {str(e)}"
        )


@router.get("/export")
async def export_configuration(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Export the current configuration as JSON.
    Returns the configuration in a downloadable format.
    """
    try:
        # Get or create user's organization
        organization = None
        if current_user.organization_id:
            organization = db.query(Organization).filter(
                Organization.id == current_user.organization_id
            ).first()

        # If user has no organization, return default config
        if not organization:
            logger.info(f"No organization for user {current_user.id}, exporting defaults")
            return {
                "version": "1.0",
                "exported_at": None,
                "organization_id": None,
                "organization_name": "Default",
                "config": DEFAULT_CONFIG
            }

        settings = organization.settings or {}
        config = settings.get("burnout_config", DEFAULT_CONFIG)

        logger.info(f"Exported configuration for organization {organization.id}")

        # Return configuration with metadata
        return {
            "version": "1.0",
            "exported_at": organization.updated_at.isoformat() if organization.updated_at else None,
            "organization_id": organization.id,
            "organization_name": organization.name,
            "config": config
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting configuration: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error exporting configuration: {str(e)}"
        )


@router.post("/import", response_model=ConfigurationResponse)
async def import_configuration(
    import_data: Dict[str, Any],
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Import configuration from exported JSON.
    """
    try:
        # Validate import data structure
        if "config" not in import_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid import data: missing 'config' field"
            )

        # Validate the configuration structure
        config_data = import_data["config"]
        validated_config = ConfigurationRequest(**config_data)

        # Get or create user's organization
        organization = None
        if current_user.organization_id:
            organization = db.query(Organization).filter(
                Organization.id == current_user.organization_id
            ).first()

        # If user has no organization or it doesn't exist, create a personal one
        if not organization:
            logger.info(f"Creating personal organization for user {current_user.id}")
            organization = Organization(
                name=f"{current_user.email}'s Organization",
                domain=current_user.email.split('@')[1] if '@' in current_user.email else "personal",
                slug=f"personal-{current_user.id}",
                plan_type="free",
                status="active",
                settings={}
            )
            db.add(organization)
            db.flush()

            # Update user's organization_id
            current_user.organization_id = organization.id
            db.commit()
            db.refresh(organization)
            logger.info(f"Created organization {organization.id} for user {current_user.id}")

        # Update configuration
        settings = organization.settings or {}
        settings["burnout_config"] = validated_config.dict()

        # Mark the JSON field as modified so SQLAlchemy detects the change
        organization.settings = settings
        flag_modified(organization, "settings")
        db.commit()
        db.refresh(organization)

        logger.info(f"Imported configuration for organization {organization.id}")

        return ConfigurationResponse(
            **validated_config.dict(),
            organization_id=organization.id,
            updated_at=organization.updated_at.isoformat() if organization.updated_at else None
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid configuration data: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error importing configuration: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error importing configuration: {str(e)}"
        )
