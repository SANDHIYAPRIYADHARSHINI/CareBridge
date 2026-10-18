import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_and_login_patient(async_client: AsyncClient):
    # Register patient
    reg_res = await async_client.post(
        "/auth/register",
        json={
            "email": "test_patient_1@carebridge.health",
            "password": "Password123!",
            "full_name": "Test Patient",
            "role": "patient",
            "phone_number": "+91 98401 11111",
        },
    )
    assert reg_res.status_code == 201
    user_data = reg_res.json()
    assert user_data["email"] == "test_patient_1@carebridge.health"
    assert user_data["role"] == "patient"
    assert "id" in user_data

    # Login patient
    login_res = await async_client.post(
        "/auth/login",
        json={
            "email": "test_patient_1@carebridge.health",
            "password": "Password123!",
        },
    )
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # Access /auth/me
    me_res = await async_client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "test_patient_1@carebridge.health"


@pytest.mark.asyncio
async def test_register_caregiver(async_client: AsyncClient):
    reg_res = await async_client.post(
        "/auth/register",
        json={
            "email": "test_cg_1@carebridge.health",
            "password": "Password123!",
            "full_name": "Test Caregiver",
            "role": "caregiver",
        },
    )
    assert reg_res.status_code == 201
    assert reg_res.json()["role"] == "caregiver"


@pytest.mark.asyncio
async def test_duplicate_email_fails(async_client: AsyncClient):
    payload = {
        "email": "duplicate@carebridge.health",
        "password": "Password123!",
        "full_name": "Duplicate User",
        "role": "patient",
    }
    res1 = await async_client.post("/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = await async_client.post("/auth/register", json=payload)
    assert res2.status_code == 400
    assert "already exists" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_invalid_login_credentials(async_client: AsyncClient):
    res = await async_client.post(
        "/auth/login",
        json={
            "email": "nonexistent@carebridge.health",
            "password": "WrongPassword",
        },
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_seed_demo_accounts(async_client: AsyncClient):
    res = await async_client.post("/auth/seed-demo")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "seeded"
    assert data["patient"]["email"] == "patient@carebridge.health"
    assert data["caregiver"]["email"] == "caregiver@carebridge.health"
