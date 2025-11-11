"""
LLM Token API endpoints for managing user's LLM API keys.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
import logging
from cryptography.fernet import Fernet
import base64
from datetime import datetime
from pydantic import BaseModel

from ...models import get_db, User
from ...auth.dependencies import get_current_user
from ...core.config import settings

router = APIRouter(prefix="/llm", tags=["llm-tokens"])

logger = logging.getLogger(__name__)

# Token encryption utilities (same pattern as Slack/GitHub)
def get_encryption_key():
    """Get or create encryption key for tokens."""
    key = settings.JWT_SECRET_KEY.encode()
    # Ensure key is 32 bytes for Fernet
    key = base64.urlsafe_b64encode(key[:32].ljust(32, b'\0'))
    return key

def encrypt_token(token: str) -> str:
    """Encrypt a token for storage."""
    fernet = Fernet(get_encryption_key())
    return fernet.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    """Decrypt a token from storage."""
    fernet = Fernet(get_encryption_key())
    return fernet.decrypt(encrypted_token.encode()).decode()

class LLMTokenRequest(BaseModel):
    token: str
    provider: str  # 'anthropic', 'openai', etc.
    use_system_token: bool = False  # If True, use Railway system token instead

class LLMTokenResponse(BaseModel):
    has_token: bool
    provider: Optional[str] = None
    token_suffix: Optional[str] = None
    token_source: str = 'system'  # 'system' or 'custom'
    created_at: Optional[datetime] = None

@router.post("/token", response_model=LLMTokenResponse)
async def store_llm_token(
    request: LLMTokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Store or update user's LLM API token, or enable system token."""

    # If user wants to use system token
    if request.use_system_token:
        import os
        system_api_key = os.getenv('ANTHROPIC_API_KEY')
        if not system_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="System LLM token not configured"
            )

        # Clear any custom token and mark as using system token
        current_user.llm_token = None
        current_user.llm_provider = 'anthropic'  # System token is Anthropic
        current_user.updated_at = datetime.now()

        db.commit()
        db.refresh(current_user)

        logger.info(f"User {current_user.id} enabled system LLM token")

        return LLMTokenResponse(
            has_token=True,
            provider='anthropic',
            token_suffix=None,  # Don't expose system token details
            token_source='system',
            created_at=None
        )
    
    # Validate provider
    allowed_providers = ['anthropic', 'openai']
    if request.provider not in allowed_providers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Allowed: {', '.join(allowed_providers)}"
        )
    
    # Validate token format based on provider
    if request.provider == 'anthropic':
        if not request.token.startswith('sk-ant-api'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Anthropic API key format. Should start with 'sk-ant-api'"
            )
    elif request.provider == 'openai':
        if not request.token.startswith('sk-'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid OpenAI API key format. Should start with 'sk-'"
            )
    
    # Test the token by making a real API call
    try:
        if request.provider == 'anthropic':
            import anthropic
            client = anthropic.Anthropic(api_key=request.token)
            # Test with a minimal API call
            response = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=1,
                messages=[{"role": "user", "content": "Hi"}]
            )
        elif request.provider == 'openai':
            import openai
            client = openai.OpenAI(api_key=request.token)
            # Test with a minimal API call
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=1
            )
    except Exception as e:
        logger.error(f"Token verification failed for {request.provider}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Token verification failed. Please check your {request.provider} API key and try again."
        )
    
    try:
        # Encrypt the token
        encrypted_token = encrypt_token(request.token)
        
        # Update user record
        current_user.llm_token = encrypted_token
        current_user.llm_provider = request.provider
        current_user.updated_at = datetime.now()
        
        db.commit()
        db.refresh(current_user)
        
        logger.info(f"LLM token stored for user {current_user.id} (provider: {request.provider})")
        
        # Return response with masked token
        token_suffix = request.token[-4:] if len(request.token) > 4 else "****"
        
        return LLMTokenResponse(
            has_token=True,
            provider=request.provider,
            token_suffix=token_suffix,
            token_source='custom',
            created_at=current_user.updated_at
        )
        
    except Exception as e:
        logger.error(f"Failed to store LLM token for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store LLM token"
        )

@router.get("/token", response_model=LLMTokenResponse)
async def get_llm_token_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get information about user's LLM token (system or custom)."""

    # Check if user has a custom token
    if current_user.has_llm_token():
        # User has custom token
        try:
            decrypted_token = decrypt_token(current_user.llm_token)
            token_suffix = decrypted_token[-4:] if len(decrypted_token) > 4 else "****"

            return LLMTokenResponse(
                has_token=True,
                provider=current_user.llm_provider,
                token_suffix=token_suffix,
                token_source='custom',
                created_at=current_user.updated_at
            )
        except Exception as e:
            logger.error(f"Failed to decrypt token for user {current_user.id}: {e}")
            # Fall through to system token check

    # Check if system token is available (default for all users)
    import os
    system_api_key = os.getenv('ANTHROPIC_API_KEY')
    if system_api_key:
        # Return system token info (default for users without custom token)
        return LLMTokenResponse(
            has_token=True,
            provider='anthropic',
            token_suffix=None,  # Don't expose system token details
            token_source='system',
            created_at=None
        )

    # No token available
    return LLMTokenResponse(has_token=False, token_source='system')

@router.delete("/token")
async def delete_llm_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete user's custom LLM token and revert to system token."""
    
    if not current_user.has_llm_token():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No LLM token found"
        )
    
    try:
        # Clear the token fields
        current_user.llm_token = None
        current_user.llm_provider = None
        current_user.updated_at = datetime.now()
        
        db.commit()
        
        logger.info(f"LLM token deleted for user {current_user.id}")
        
        return {"message": "LLM token deleted successfully"}
        
    except Exception as e:
        logger.error(f"Failed to delete LLM token for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete LLM token"
        )

def get_user_llm_token(user: User) -> Optional[str]:
    """
    Utility function to get decrypted LLM token for a user.
    Used by other services that need the actual token.
    """
    if not user.has_llm_token():
        return None
    
    try:
        return decrypt_token(user.llm_token)
    except Exception as e:
        logger.error(f"Failed to decrypt LLM token for user {user.id}: {e}")
        return None