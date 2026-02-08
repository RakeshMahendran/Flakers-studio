"""
Authentication API - Basic auth for demo purposes
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import uuid

router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    tenant_id: str
    user_id: str

@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Simple login for demo purposes
    In production, this would integrate with proper auth system
    """
    # Demo credentials
    if request.email == "demo@flakers.studio" and request.password == "demo123":
        return LoginResponse(
            access_token="demo_token_123",
            tenant_id=str(uuid.uuid4()),
            user_id=str(uuid.uuid4())
        )
    
    raise HTTPException(status_code=401, detail="Invalid credentials")