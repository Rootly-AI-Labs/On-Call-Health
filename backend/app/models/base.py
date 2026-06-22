"""
Database configuration and base models.
"""
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging
import os

logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError(
        "DATABASE_URL environment variable is required. "
        "For local development, use PostgreSQL (e.g., postgresql://user:password@localhost/dbname)"
    )


def _int_env(name: str, default: int) -> int:
    """Read an integer setting from the environment, falling back to a default.

    Tolerant of unset/blank/invalid values so a typo in a deploy variable can
    never crash the app at import time — it just falls back to the default.
    """
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid value for %s=%r; falling back to default %d", name, raw, default)
        return default


# --- Connection pool configuration -------------------------------------------
# IMPORTANT: this application shares a single PostgreSQL server with other
# services (notably the OnCallHealthData admin dashboard). PostgreSQL caps the
# total number of concurrent connections via `max_connections`, so the SUM of
# (DB_POOL_SIZE + DB_MAX_OVERFLOW) across EVERY process and service that talks
# to the database must stay comfortably below that ceiling. Exceeding it makes
# new connections fail with "FATAL: sorry, too many clients already".
#
# Budgeting rule of thumb (check the real ceiling with `SHOW max_connections;`):
#   sum over all processes(pool_size + max_overflow) + headroom  <  max_connections
# e.g. 2 processes here (web + worker) x (10 + 10) = 40, leaving room for the
# admin dashboard and ad-hoc psql sessions under a typical 100-connection cap.
#
# Every value is environment-overridable so the pool can be retuned for a given
# Railway/Postgres plan WITHOUT a code deploy. Defaults are deliberately
# conservative (previously these were a hard-coded 30 + 20 = 50 per process,
# which alone could exhaust the shared server).
POOL_SIZE = _int_env("DB_POOL_SIZE", 10)          # persistent connections kept warm
MAX_OVERFLOW = _int_env("DB_MAX_OVERFLOW", 10)    # extra burst connections beyond pool_size
POOL_TIMEOUT = _int_env("DB_POOL_TIMEOUT", 30)    # seconds a request waits for a free connection
POOL_RECYCLE = _int_env("DB_POOL_RECYCLE", 1800)  # recycle connections older than this many seconds

# Query timeout settings (in milliseconds)
STATEMENT_TIMEOUT_MS = _int_env("DB_STATEMENT_TIMEOUT_MS", 60000)  # 60 seconds default
LOCK_TIMEOUT_MS = _int_env("DB_LOCK_TIMEOUT_MS", 30000)            # 30 seconds default

# Tag every connection so it is identifiable in pg_stat_activity. This is what
# lets you run, during an incident:
#   SELECT application_name, count(*) FROM pg_stat_activity GROUP BY 1 ORDER BY 2 DESC;
# and see at a glance which service is holding connections.
APP_NAME = os.getenv("DB_APPLICATION_NAME", "oncall-health-backend")

# Create PostgreSQL engine with bounded pool limits and query timeouts
engine = create_engine(
    DATABASE_URL,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_recycle=POOL_RECYCLE,
    pool_pre_ping=True,     # transparently replace connections dropped server-side
    pool_use_lifo=True,     # reuse the most-recently-returned connection first, so
                            # connections in the idle tail age out and get recycled —
                            # keeps the number of actually-open connections low under
                            # bursty load instead of holding the full pool open
    echo_pool=False,        # set to True (or DB_ECHO_POOL) for verbose pool debugging
    connect_args={
        "application_name": APP_NAME,
        "options": f"-c statement_timeout={STATEMENT_TIMEOUT_MS} -c lock_timeout={LOCK_TIMEOUT_MS}",
    },
)

logger.info(
    "Database engine initialized: pool_size=%d max_overflow=%d "
    "(max %d connections per process), pool_timeout=%ds pool_recycle=%ds application_name=%s",
    POOL_SIZE, MAX_OVERFLOW, POOL_SIZE + MAX_OVERFLOW, POOL_TIMEOUT, POOL_RECYCLE, APP_NAME,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_pool_status() -> dict:
    """Return current connection-pool utilization for health/debug endpoints.

    `checked_out` is the number of connections currently in use; when it
    approaches `total_capacity` the app is close to saturating its own pool.
    """
    pool = engine.pool
    return {
        "pool_size": POOL_SIZE,
        "max_overflow": MAX_OVERFLOW,
        "total_capacity": POOL_SIZE + MAX_OVERFLOW,
        "checked_out": pool.checkedout(),   # connections currently handed out / in use
        "checked_in": pool.checkedin(),     # idle connections available for reuse
        "overflow": pool.overflow(),        # overflow connections beyond pool_size in use
        "application_name": APP_NAME,
    }

# Base class for all models
Base = declarative_base()

# Dependency to get DB session with better error handling
def get_db():
    db = SessionLocal()
    try:
        yield db
        db.commit()  # Commit successful transactions
    except Exception as e:
        db.rollback()  # Rollback on errors
        raise e
    finally:
        db.close()  # Always close the session

# Create all tables
def create_tables():
    Base.metadata.create_all(bind=engine)