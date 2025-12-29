"""
Configuration settings for the application.
"""
import os
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings:
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        raise ValueError(
            "DATABASE_URL environment variable is required. "
            "For local development, use PostgreSQL (e.g., postgresql://user:password@localhost/dbname)"
        )
    
    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Frontend URL for survey links
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    # OAuth - Google
    GOOGLE_CLIENT_ID: Optional[str] = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: Optional[str] = os.getenv("GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
    
    # OAuth - GitHub
    GITHUB_CLIENT_ID: Optional[str] = os.getenv("GITHUB_CLIENT_ID") 
    GITHUB_CLIENT_SECRET: Optional[str] = os.getenv("GITHUB_CLIENT_SECRET")
    GITHUB_REDIRECT_URI: str = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/auth/github/callback")
    
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

    # Environment detection
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Logging configuration
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Rootly API
    ROOTLY_API_BASE_URL: str = os.getenv("ROOTLY_API_BASE_URL", "https://api.rootly.com")

settings = Settings()