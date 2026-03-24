"""
Configuration settings for the application.
"""
import os
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Detect environment early for error message customization
_ENV = os.getenv("ENVIRONMENT", "development")
_IS_PRODUCTION = _ENV in ("production", "staging")

class Settings:
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        raise ValueError(
            "DATABASE_URL environment variable is required. "
            "For local development, use PostgreSQL (e.g., postgresql://user:password@localhost/dbname)"
        )
    
    # JWT - also used for integration token encryption
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY")
    if not JWT_SECRET_KEY:
        raise ValueError("JWT_SECRET_KEY environment variable is required")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Frontend URL for survey links
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    # Backend API URL (used for email links like unsubscribe)
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000")
    
    # OAuth - Google
    GOOGLE_CLIENT_ID: Optional[str] = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: Optional[str] = os.getenv("GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
    
    # OAuth - GitHub
    GITHUB_CLIENT_ID: Optional[str] = os.getenv("GITHUB_CLIENT_ID") 
    GITHUB_CLIENT_SECRET: Optional[str] = os.getenv("GITHUB_CLIENT_SECRET")
    GITHUB_REDIRECT_URI: str = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/auth/github/callback")
    
    # OAuth - Okta (OIDC)
    OKTA_AUTH_ENABLED: bool = os.getenv("OKTA_AUTH_ENABLED", "false").lower() == "true"
    OKTA_CLIENT_ID: Optional[str] = os.getenv("OKTA_CLIENT_ID")
    OKTA_CLIENT_SECRET: Optional[str] = os.getenv("OKTA_CLIENT_SECRET")
    OKTA_ISSUER: Optional[str] = os.getenv("OKTA_ISSUER")
    OKTA_REDIRECT_URI: str = os.getenv("OKTA_REDIRECT_URI", "http://localhost:8000/auth/okta/callback")
    
    # OAuth - Slack
    SLACK_CLIENT_ID: Optional[str] = os.getenv("SLACK_CLIENT_ID")
    SLACK_CLIENT_SECRET: Optional[str] = os.getenv("SLACK_CLIENT_SECRET")
    SLACK_SIGNING_SECRET: Optional[str] = os.getenv("SLACK_SIGNING_SECRET")
    SLACK_REDIRECT_URI: str = os.getenv("SLACK_REDIRECT_URI", "http://localhost:8000/auth/slack/callback")

    # OAuth - Jira
    JIRA_CLIENT_ID: Optional[str] = os.getenv("JIRA_CLIENT_ID")
    JIRA_CLIENT_SECRET: Optional[str] = os.getenv("JIRA_CLIENT_SECRET")

    # OAuth - Linear
    LINEAR_CLIENT_ID: Optional[str] = os.getenv("LINEAR_CLIENT_ID")
    LINEAR_CLIENT_SECRET: Optional[str] = os.getenv("LINEAR_CLIENT_SECRET")

    # Environment detection (must be set early for error message handling)
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Logging configuration
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Rootly API
    ROOTLY_API_BASE_URL: str = os.getenv("ROOTLY_API_BASE_URL", "https://api.rootly.com")

    # Weekly digest emails
    WEEKLY_DIGEST_ENABLED: bool = os.getenv("WEEKLY_DIGEST_ENABLED", "false").lower() == "true"


    WEEKLY_DIGEST_FORCE_SEND: bool = os.getenv("WEEKLY_DIGEST_FORCE_SEND", "false").lower() == "true"
    RESEND_API_KEY: Optional[str] = os.getenv("RESEND_API_KEY")
    RESEND_FROM_EMAIL: Optional[str] = os.getenv("RESEND_FROM_EMAIL")
    RESEND_FROM_NAME: str = os.getenv("RESEND_FROM_NAME", "On-Call Health")
    #todo
    # API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8000")

    # Working Hours Configuration
    # These define what is considered "business hours" for burnout analysis
    # Hours are in 24-hour format (0-23) and applied in each user's local timezone
    BUSINESS_HOURS_START: int = int(os.getenv("BUSINESS_HOURS_START", "9"))   # 9 AM
    BUSINESS_HOURS_END: int = int(os.getenv("BUSINESS_HOURS_END", "17"))      # 5 PM
    LATE_NIGHT_START: int = int(os.getenv("LATE_NIGHT_START", "22"))          # 10 PM
    LATE_NIGHT_END: int = int(os.getenv("LATE_NIGHT_END", "6"))               # 6 AM

    # Redis Configuration (for distributed locking)
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # Token Refresh Distributed Lock Configuration
    TOKEN_REFRESH_LOCK_TTL: int = int(os.getenv("TOKEN_REFRESH_LOCK_TTL", "30"))  # seconds
    TOKEN_REFRESH_LOCK_TIMEOUT: float = float(os.getenv("TOKEN_REFRESH_LOCK_TIMEOUT", "10"))  # seconds

    @property
    def okta_auth_available(self) -> bool:
        """Return True only when Okta auth is explicitly enabled and fully configured."""
        return bool(
            self.OKTA_AUTH_ENABLED
            and self.OKTA_CLIENT_ID
            and self.OKTA_CLIENT_SECRET
            and self.OKTA_ISSUER
            and self.OKTA_REDIRECT_URI
        )

settings = Settings()
