from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User, UserRole
from app.schemas.auth import TokenResponse, UserCreate, UserLogin, UserResponse
from app.services.auth_service import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


def require_role(required_role: UserRole):
    """Enforces specific user role on protected endpoints."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action restricted to {required_role.value} accounts.",
            )
        return current_user
    return role_checker


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check existing user
    result = await db.execute(select(User).where(User.email == payload.email.lower().strip()))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )

    user = User(
        email=payload.email.lower().strip(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        phone_number=payload.phone_number,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email.lower().strip()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = create_access_token(data={"sub": user.id, "role": user.role.value})
    return TokenResponse(access_token=access_token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/seed-demo", tags=["Authentication"])
async def seed_demo_accounts(db: AsyncSession = Depends(get_db)):
    """Seeds synthetic demo accounts for testing patient and caregiver workflows."""
    demo_patient_email = "patient@carebridge.health"
    demo_caregiver_email = "caregiver@carebridge.health"

    # Check patient
    res_patient = await db.execute(select(User).where(User.email == demo_patient_email))
    patient = res_patient.scalar_one_or_none()
    if not patient:
        patient = User(
            email=demo_patient_email,
            hashed_password=hash_password("CareBridge@123"),
            full_name="Kaviya Sundaram",
            role=UserRole.PATIENT,
            phone_number="+91 98401 23456",
        )
        db.add(patient)

    # Check caregiver
    res_caregiver = await db.execute(select(User).where(User.email == demo_caregiver_email))
    caregiver = res_caregiver.scalar_one_or_none()
    if not caregiver:
        caregiver = User(
            email=demo_caregiver_email,
            hashed_password=hash_password("CareBridge@123"),
            full_name="Dr. Anitha Nathan",
            role=UserRole.CAREGIVER,
            phone_number="+91 94440 98765",
        )
        db.add(caregiver)

    await db.commit()
    return {
        "status": "seeded",
        "patient": {"email": demo_patient_email, "role": "patient"},
        "caregiver": {"email": demo_caregiver_email, "role": "caregiver"},
        "default_password": "CareBridge@123",
    }
