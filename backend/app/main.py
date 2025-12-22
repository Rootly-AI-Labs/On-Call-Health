"""
FastAPI main application for On-call Burnout Detector.
"""
import os
import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi.errors import RateLimitExceeded
from .models import create_tables
from .core.config import settings
from .core.rate_limiting import limiter, custom_rate_limit_exceeded_handler
from .middleware.security import security_middleware
from .api.endpoints import auth, rootly, analysis, analyses, pagerduty, github, slack, jira,  llm, mappings, manual_mappings, debug_mappings, migrate, admin, notifications, invitations, surveys

# Configure logging based on environment variable
LOG_LEVEL = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Set specific loggers to WARNING in production to reduce noise
if settings.ENVIRONMENT == "production" or LOG_LEVEL >= logging.WARNING:
    # Reduce verbosity for noisy modules
    logging.getLogger("app.api.endpoints.slack").setLevel(logging.WARNING)
    logging.getLogger("app.services.survey_scheduler").setLevel(logging.WARNING)
    logging.getLogger("app.middleware.security").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)
logger.info(f"Starting application with log level: {settings.LOG_LEVEL}")

# Create FastAPI application
app = FastAPI(
    title="On-call Burnout Detector API",
    description="API for detecting burnout risk in engineering teams using Rootly incident data",
    version="1.0.0",
    swagger_ui_parameters={
        "defaultModelsExpandDepth": 1,  # Don't expand schemas deeply
        "syntaxHighlight.theme": "monokai",
        "displayRequestDuration": True,
        "filter": True,
        "tryItOutEnabled": True,
    },
    docs_url="/docs",
    openapi_url="/openapi.json"
)

# Mount static files for favicon
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Add rate limiting to the app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, custom_rate_limit_exceeded_handler)

# Add GZip compression middleware (must be added before other middleware)
# Compresses responses > 1KB with gzip, typically achieves 70-90% compression for JSON
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Add security middleware
app.middleware("http")(security_middleware)

# Configure CORS - Secure configuration
def get_cors_origins():
    """Get allowed CORS origins based on environment."""
    # Always allow the configured frontend URL
    origins = [settings.FRONTEND_URL]
    
    # Add common development ports for localhost
    if settings.FRONTEND_URL.startswith("http://localhost"):
        # Allow common Next.js development ports
        origins.extend([
            "http://localhost:3000",
            "http://localhost:3001", 
            "http://localhost:3002"
        ])
    
    # TEMPORARY: Allow localhost for OAuth testing (remove after testing)
    if not any("localhost" in origin for origin in origins):
        origins.extend([
            "http://localhost:3000",
            "http://localhost:3001"
        ])
    
    # Add production domains if they exist
    production_frontend = os.getenv("PRODUCTION_FRONTEND_URL")
    if production_frontend:
        origins.append(production_frontend)
    
    # Add the production domain explicitly
    origins.extend([
        "https://www.oncallburnout.com",
        "https://oncallburnout.com"
    ])
    
    # Add Vercel preview URLs if in development/staging
    vercel_url = os.getenv("VERCEL_URL") 
    if vercel_url:
        origins.append(f"https://{vercel_url}")
    
    # Remove duplicates while preserving order
    origins = list(dict.fromkeys(origins))

    # Log CORS origins for debugging (only in debug mode)
    logger.debug(f"CORS allowed origins: {origins}")

    return origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),  # Specific allowed origins only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],  # Specific methods only
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Cache-Control",
        "Pragma"
    ],  # Specific headers only
)

@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "On-call Burnout Detector API", "version": "1.0.0"}

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "rootly-burnout-detector"}

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    """Serve favicon for the API documentation."""
    return FileResponse("app/static/favicon.png")

# Initialize database tables
@app.on_event("startup")
async def startup_event():
    create_tables()

    # Run database migrations
    try:
        from migrations.migration_runner import run_migrations
        print("🔧 Running database migrations...")
        success = run_migrations()
        if success:
            print("✅ All migrations applied successfully")
        else:
            print("⚠️  Some migrations failed - check logs")
    except Exception as e:
        print(f"⚠️  Migration runner failed: {e}")
        # Don't fail startup if migrations fail
        pass

    # Start survey scheduler
    from app.services.survey_scheduler import survey_scheduler
    from app.models import SessionLocal

    survey_scheduler.start()
    print("✅ Survey scheduler started")

    # Load existing schedules from database
    db = SessionLocal()
    try:
        survey_scheduler.schedule_organization_surveys(db)
        print("✅ Loaded survey schedules from database")
    except Exception as e:
        print(f"⚠️ Error loading survey schedules: {str(e)}")
    finally:
        db.close()
    

# Include API routers
app.include_router(auth.router, prefix="/auth", tags=["authentication"])
app.include_router(rootly.router, prefix="/rootly", tags=["rootly"])
app.include_router(pagerduty.router, prefix="/pagerduty", tags=["pagerduty"])
app.include_router(analyses.router, prefix="/analyses", tags=["analyses"])
app.include_router(github.router, prefix="/integrations", tags=["github-integration"])
app.include_router(slack.router, prefix="/integrations", tags=["slack-integration"])
app.include_router(jira.router, prefix="/integrations", tags=["jira-integration"])
app.include_router(llm.router, tags=["llm-tokens"])
app.include_router(mappings.router, prefix="/integrations", tags=["integration-mappings"])
app.include_router(manual_mappings.router, prefix="/integrations", tags=["manual-mappings"])
app.include_router(debug_mappings.router, prefix="/api", tags=["debug"])
app.include_router(migrate.router, prefix="/api/migrate", tags=["migration"])
app.include_router(admin.router, prefix="/api", tags=["admin"])
app.include_router(notifications.router, prefix="/api", tags=["notifications"])
app.include_router(invitations.router, prefix="/api", tags=["invitations"])
app.include_router(surveys.router, prefix="/api/surveys", tags=["surveys"])
logger.debug("Surveys router registered successfully")
