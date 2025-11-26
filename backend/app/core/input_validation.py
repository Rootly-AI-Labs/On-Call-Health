"""
Comprehensive input validation and sanitization for API security.
"""
import re
import html
import urllib.parse
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator, EmailStr, HttpUrl, ConfigDict
from enum import Enum
import logging

logger = logging.getLogger(__name__)

# Security constants
MAX_STRING_LENGTH = 10000
MAX_LIST_LENGTH = 1000
MAX_DICT_KEYS = 100

# Regex patterns for validation
PATTERNS = {
    # API tokens - common formats
    "rootly_token": re.compile(r"^[A-Za-z0-9_-]{20,100}$"),
    "github_token": re.compile(r"^(ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{36,255}$"),
    "slack_token": re.compile(r"^[a-zA-Z]{3,4}-[A-Za-z0-9-]{10,100}$"),  # Slack token pattern
    "anthropic_token": re.compile(r"^sk-ant-[A-Za-z0-9-_]{20,200}$"),
    "openai_token": re.compile(r"^sk-[A-Za-z0-9]{48}$"),
    
    # Identifiers
    "uuid": re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE),
    "github_username": re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9-]){0,38}$"),
    "slack_user_id": re.compile(r"^U[A-Z0-9]{8,11}$"),
    "integration_name": re.compile(r"^[a-zA-Z0-9\s\-_\.]{1,100}$"),
    
    # URLs and domains
    "domain": re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$"),
    
    # Safe characters only - no potential injection
    "safe_alphanumeric": re.compile(r"^[a-zA-Z0-9\s\-_\.]{1,255}$"),
    "safe_identifier": re.compile(r"^[a-zA-Z0-9_-]{1,100}$"),
}

class PlatformType(str, Enum):
    """Allowed platform types."""
    ROOTLY = "rootly"
    PAGERDUTY = "pagerduty"
    GITHUB = "github"
    SLACK = "slack"
    ANTHROPIC = "anthropic"
    OPENAI = "openai"

class AnalysisTimeRange(str, Enum):
    """Allowed analysis time ranges."""
    DAYS_7 = "7"
    DAYS_14 = "14"
    DAYS_30 = "30"
    DAYS_60 = "60"
    DAYS_90 = "90"

def sanitize_string(value: str, max_length: int = MAX_STRING_LENGTH) -> str:
    """
    Sanitize string input to prevent XSS and injection attacks.
    """
    if not isinstance(value, str):
        raise ValueError("Input must be a string")
    
    # Truncate to max length
    value = value[:max_length]
    
    # URL decode to normalize input FIRST (to detect encoded attacks)
    value = urllib.parse.unquote(value)
    
    # HTML escape to prevent XSS AFTER decoding
    value = html.escape(value)
    
    # Remove null bytes and control characters
    value = ''.join(char for char in value if ord(char) >= 32 or char in '\n\r\t')
    
    # Strip excessive whitespace
    value = ' '.join(value.split())
    
    return value

def validate_token_format(platform: str, token: str) -> bool:
    """
    Validate API token format based on platform.
    """
    pattern_key = f"{platform.lower()}_token"
    pattern = PATTERNS.get(pattern_key)
    
    if not pattern:
        logger.warning(f"No token pattern defined for platform: {platform}")
        # Fallback: basic validation for unknown platforms
        return len(token) >= 10 and re.match(r"^[A-Za-z0-9_-]+$", token)
    
    return bool(pattern.match(token))

def validate_no_injection(value: str) -> str:
    """
    Validate that input doesn't contain potential injection patterns.
    """
    if not isinstance(value, str):
        return value
    
    # SQL injection patterns
    sql_patterns = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)",
        r"(-{2}|\/\*|\*\/)",  # SQL comments
        r"(\b(OR|AND)\s+\d+\s*=\s*\d+)",  # Boolean injection
        r"([\';])",  # SQL terminators
    ]
    
    # Command injection patterns  
    command_patterns = [
        r"(\||&|;|\$\(|\`)",  # Command chaining
        r"(\.\./|\.\.\\)",    # Directory traversal
        r"(\b(rm|del|format|shutdown|reboot)\b)",  # Dangerous commands
    ]
    
    # Script injection patterns
    script_patterns = [
        r"(<script|</script>|javascript:|vbscript:|onload=|onerror=)",
        r"(\beval\s*\(|\bexec\s*\()",
    ]
    
    all_patterns = sql_patterns + command_patterns + script_patterns
    
    for pattern in all_patterns:
        if re.search(pattern, value, re.IGNORECASE):
            logger.warning(f"Potential injection detected in input: {pattern}")
            raise ValueError(f"Input contains potentially dangerous content")
    
    return value

class BaseValidatedModel(BaseModel):
    """Base model with common validation logic."""
    
    # Pydantic V2 configuration using ConfigDict
    model_config = ConfigDict(
        # Validate all fields on assignment
        validate_assignment=True,
        # Strip whitespace from strings
        str_strip_whitespace=True,
        # Forbid extra fields not defined in model
        extra='forbid',
        # Use enum values instead of names
        use_enum_values=True
    )

    @field_validator('*', mode='before')
    @classmethod
    def validate_strings(cls, v, info):
        """Apply string validation to all string fields."""
        if isinstance(v, str):
            # Check length limits - use default if no max_length specified
            max_len = MAX_STRING_LENGTH
            if hasattr(info, 'field_name') and info.field_name:
                # In Pydantic V2, access field constraints differently
                field_info = cls.model_fields.get(info.field_name)
                if field_info and hasattr(field_info, 'constraints'):
                    max_len = getattr(field_info.constraints, 'max_length', MAX_STRING_LENGTH)
            
            if len(v) > max_len:
                raise ValueError(f"String too long. Max length: {max_len}")
            
            # Sanitize and check for injection
            v = sanitize_string(v, max_len)
            v = validate_no_injection(v)
        
        elif isinstance(v, list) and len(v) > MAX_LIST_LENGTH:
            raise ValueError(f"List too long. Max length: {MAX_LIST_LENGTH}")
        
        elif isinstance(v, dict) and len(v) > MAX_DICT_KEYS:
            raise ValueError(f"Dictionary too large. Max keys: {MAX_DICT_KEYS}")
        
        return v

# ===== API TOKEN VALIDATION MODELS =====

class TokenValidation(BaseValidatedModel):
    """Base model for API token validation."""
    token: str = Field(..., min_length=10, max_length=500)
    
    @field_validator('token')
    @classmethod
    def validate_token_safety(cls, v):
        """Validate token doesn't contain dangerous characters."""
        # Allow only safe characters for tokens
        if not re.match(r"^[A-Za-z0-9_\-\.]+$", v):
            raise ValueError("Token contains invalid characters")
        return v

class RootlyTokenRequest(TokenValidation):
    """Rootly API token validation."""
    token: str = Field(..., description="Rootly API token")
    
    @field_validator('token')
    @classmethod
    def validate_rootly_token(cls, v):
        """Validate Rootly token format."""
        if not validate_token_format("rootly", v):
            logger.warning("Invalid Rootly token format submitted")
            raise ValueError("Invalid Rootly token format")
        return v

class GitHubTokenRequest(TokenValidation):
    """GitHub API token validation.""" 
    token: str = Field(..., description="GitHub personal access token")
    
    @field_validator('token')
    @classmethod
    def validate_github_token(cls, v):
        """Validate GitHub token format."""
        if not validate_token_format("github", v):
            logger.warning("Invalid GitHub token format submitted")
            raise ValueError("Invalid GitHub token format. Must start with 'ghp_', 'gho_', 'ghu_', 'ghs_', or 'ghr_'")
        return v

class SlackTokenRequest(TokenValidation):
    """Slack API token validation."""
    token: str = Field(..., description="Slack bot/user token")
    
    @field_validator('token')
    @classmethod
    def validate_slack_token(cls, v):
        """Validate Slack token format."""
        if not validate_token_format("slack", v):
            logger.warning("Invalid Slack token format submitted")
            raise ValueError("Invalid Slack token format. Must use valid Slack token prefix.")
        return v

class LLMTokenRequest(TokenValidation):
    """LLM API token validation."""
    provider: PlatformType = Field(..., description="LLM provider")
    token: str = Field(..., description="LLM API token")
    
    @field_validator('token')
    @classmethod
    def validate_llm_token(cls, v, info):
        """Validate LLM token format based on provider."""
        # In Pydantic V2, we need to use model_validate to get other field values
        # For now, we'll just validate the token format generically
        if not re.match(r"^[A-Za-z0-9_\-\.]+$", v):
            raise ValueError("Invalid token format")
        return v

# ===== INTEGRATION VALIDATION MODELS =====

class IntegrationBase(BaseValidatedModel):
    """Base integration validation."""
    name: str = Field(..., min_length=1, max_length=100, description="Integration name")
    
    @field_validator('name')
    @classmethod
    def validate_integration_name(cls, v):
        """Validate integration name is safe."""
        if not PATTERNS["integration_name"].match(v):
            raise ValueError("Integration name contains invalid characters")
        return v

class RootlyIntegrationRequest(IntegrationBase):
    """Rootly integration creation/update."""
    token: str = Field(..., description="Rootly API token")
    organization_domain: Optional[str] = Field(None, max_length=255, description="Rootly organization domain")
    
    @field_validator('token')
    @classmethod
    def validate_token(cls, v):
        """Validate Rootly token."""
        if not validate_token_format("rootly", v):
            raise ValueError("Invalid Rootly token format")
        return v
    
    @field_validator('organization_domain')
    @classmethod
    def validate_domain(cls, v):
        """Validate domain format."""
        if v and not PATTERNS["domain"].match(v):
            raise ValueError("Invalid domain format")
        return v

class GitHubIntegrationRequest(IntegrationBase):
    """GitHub integration creation/update."""
    token: str = Field(..., description="GitHub personal access token")
    organization: Optional[str] = Field(None, max_length=100, description="GitHub organization")
    
    @field_validator('token')
    @classmethod
    def validate_token(cls, v):
        """Validate GitHub token."""
        if not validate_token_format("github", v):
            raise ValueError("Invalid GitHub token format")
        return v
    
    @field_validator('organization')
    @classmethod
    def validate_organization(cls, v):
        """Validate GitHub organization name."""
        if v and not PATTERNS["github_username"].match(v):
            raise ValueError("Invalid GitHub organization name")
        return v

# ===== ANALYSIS VALIDATION MODELS =====

class AnalysisRequest(BaseValidatedModel):
    """Burnout analysis request validation."""
    integration_id: Union[int, str] = Field(..., description="Integration ID (int for regular, str for beta)")
    time_range: int = Field(30, gt=0, le=365, description="Analysis time range in days")
    include_weekends: bool = Field(True, description="Include weekend data")
    include_github: bool = Field(False, description="Include GitHub data")
    include_slack: bool = Field(False, description="Include Slack data")
    include_jira: bool = Field(False, description="Include Jira data")
    enable_ai: bool = Field(False, description="Enable AI insights")
    
    @field_validator('integration_id')
    @classmethod
    def validate_integration_id(cls, v):
        """Validate integration ID format."""
        if isinstance(v, int):
            # Regular integration ID must be positive
            if v <= 0:
                raise ValueError("Integration ID must be positive")
        elif isinstance(v, str):
            # Beta integration ID must match expected format
            if not v.startswith("beta-"):
                raise ValueError("String integration ID must start with 'beta-'")
            if v not in ["beta-rootly", "beta-pagerduty"]:
                raise ValueError("Invalid beta integration ID")
        else:
            raise ValueError("Integration ID must be int or str")
        return v
    
    @field_validator('time_range')
    @classmethod
    def validate_time_range(cls, v):
        """Validate time range is reasonable."""
        allowed_ranges = [7, 14, 30, 60, 90, 180, 365]
        if v not in allowed_ranges:
            raise ValueError(f"Time range must be one of: {allowed_ranges}")
        return v

class AnalysisFilterRequest(BaseValidatedModel):
    """Analysis filtering and pagination."""
    integration_id: Optional[int] = Field(None, gt=0, description="Filter by integration")
    limit: int = Field(20, gt=0, le=100, description="Results per page")
    offset: int = Field(0, ge=0, description="Results offset")
    status: Optional[str] = Field(None, pattern="^(pending|running|completed|failed)$", description="Filter by status")

# ===== USER MAPPING VALIDATION MODELS =====

class UserMappingRequest(BaseValidatedModel):
    """User mapping creation/update."""
    source_platform: PlatformType = Field(..., description="Source platform")
    source_identifier: EmailStr = Field(..., description="Source identifier (email)")
    target_platform: PlatformType = Field(..., description="Target platform")
    target_identifier: str = Field(..., min_length=1, max_length=100, description="Target identifier")
    
    @field_validator('target_identifier')
    @classmethod
    def validate_target_identifier(cls, v):
        """Validate target identifier format."""
        # Generic validation - platform-specific validation can be added later
        if not PATTERNS["safe_identifier"].match(v):
            raise ValueError("Invalid target identifier format")
        
        return v

class BulkMappingRequest(BaseValidatedModel):
    """Bulk user mapping operations."""
    mappings: List[UserMappingRequest] = Field(..., min_items=1, max_items=100, description="List of mappings")

# ===== SEARCH AND QUERY VALIDATION =====

class SearchRequest(BaseValidatedModel):
    """Search and query validation."""
    query: str = Field(..., min_length=1, max_length=500, description="Search query")
    filters: Optional[Dict[str, Union[str, int, bool]]] = Field(None, description="Search filters")
    
    @field_validator('query')
    @classmethod
    def validate_search_query(cls, v):
        """Validate search query is safe."""
        # Remove potential injection patterns
        v = validate_no_injection(v)
        
        # Ensure reasonable length for search
        if len(v.strip()) == 0:
            raise ValueError("Search query cannot be empty")
        
        return v
    
    @field_validator('filters')
    @classmethod
    def validate_filters(cls, v):
        """Validate search filters."""
        if v is None:
            return v
        
        # Validate each filter value
        for key, value in v.items():
            if isinstance(value, str):
                v[key] = validate_no_injection(value)
                v[key] = sanitize_string(value, 100)
        
        return v

# ===== WEBHOOK AND CALLBACK VALIDATION =====

class WebhookRequest(BaseValidatedModel):
    """Webhook payload validation.""" 
    source: str = Field(..., pattern="^[a-zA-Z0-9_-]+$", max_length=50, description="Webhook source")
    event_type: str = Field(..., pattern="^[a-zA-Z0-9._-]+$", max_length=100, description="Event type")
    payload: Dict[str, Any] = Field(..., description="Webhook payload")
    signature: Optional[str] = Field(None, max_length=500, description="Webhook signature")
    
    @field_validator('payload')
    @classmethod
    def validate_payload_size(cls, v):
        """Validate payload isn't too large."""
        # Convert to string to estimate size
        import json
        payload_str = json.dumps(v)
        if len(payload_str) > 100000:  # 100KB limit
            raise ValueError("Webhook payload too large")
        return v

# ===== VALIDATION UTILITIES =====

def validate_request_size(content_length: Optional[int] = None) -> bool:
    """
    Validate request size to prevent DoS attacks.
    """
    MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10MB
    
    if content_length and content_length > MAX_REQUEST_SIZE:
        logger.warning(f"Request size too large: {content_length} bytes")
        return False
    
    return True

def sanitize_dict_recursive(data: Dict[str, Any], max_depth: int = 10) -> Dict[str, Any]:
    """
    Recursively sanitize dictionary values.
    """
    if max_depth <= 0:
        return {}
    
    sanitized = {}
    for key, value in data.items():
        # Sanitize key
        safe_key = sanitize_string(str(key), 100)
        
        # Sanitize value based on type
        if isinstance(value, str):
            sanitized[safe_key] = sanitize_string(value)
        elif isinstance(value, dict):
            sanitized[safe_key] = sanitize_dict_recursive(value, max_depth - 1)
        elif isinstance(value, list):
            sanitized[safe_key] = [
                sanitize_string(str(item)) if isinstance(item, str) else item
                for item in value[:MAX_LIST_LENGTH]
            ]
        else:
            sanitized[safe_key] = value
    
    return sanitized

# Export validation functions for use in endpoints
__all__ = [
    'BaseValidatedModel',
    'TokenValidation', 
    'RootlyTokenRequest',
    'GitHubTokenRequest', 
    'SlackTokenRequest',
    'LLMTokenRequest',
    'IntegrationBase',
    'RootlyIntegrationRequest',
    'GitHubIntegrationRequest', 
    'AnalysisRequest',
    'AnalysisFilterRequest',
    'UserMappingRequest',
    'BulkMappingRequest',
    'SearchRequest',
    'WebhookRequest',
    'validate_token_format',
    'validate_no_injection',
    'sanitize_string',
    'sanitize_dict_recursive',
    'validate_request_size',
    'PlatformType',
    'AnalysisTimeRange'
]