import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_hospitals_auto_seeds(async_client: AsyncClient):
    """Verifies hospital list auto-seeds synthetic facilities and includes facilities & simulation flag."""
    response = await async_client.get("/hospitals/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 5
    first = data[0]
    assert "name" in first
    assert "address" in first
    assert "latitude" in first
    assert "longitude" in first
    assert "emergency_available" in first
    assert "facilities" in first
    assert isinstance(first["facilities"], list)
    assert len(first["facilities"]) > 0
    assert first["is_simulated"] is True


@pytest.mark.asyncio
async def test_filter_hospitals_by_query(async_client: AsyncClient):
    """Verifies searching hospitals by name or address."""
    response = await async_client.get("/hospitals/?query=Apollo")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    for hosp in data:
        assert (
            "apollo" in hosp["name"].lower()
            or "apollo" in hosp["address"].lower()
            or any("apollo" in f.lower() for f in hosp.get("facilities", []))
        )


@pytest.mark.asyncio
async def test_filter_hospitals_by_facility(async_client: AsyncClient):
    """Verifies filtering hospitals by available clinical facility."""
    response = await async_client.get("/hospitals/?facility=Cath+Lab")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    for hosp in data:
        assert any("cath lab" in f.lower() for f in hosp["facilities"])


@pytest.mark.asyncio
async def test_hospitals_distance_calculation(async_client: AsyncClient):
    """Verifies distance calculation and sorting when user GPS coordinates are provided."""
    # Greams Road coordinates: ~13.0569, 80.2526
    response = await async_client.get("/hospitals/?lat=13.0569&lon=80.2526")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 5
    # Closest hospital should have distance_km close to 0.0
    assert data[0]["distance_km"] is not None
    assert data[0]["distance_km"] < 1.0
    # The list should be sorted by distance ascending
    distances = [h["distance_km"] for h in data if h["distance_km"] is not None]
    assert distances == sorted(distances)


@pytest.mark.asyncio
async def test_get_hospital_by_id(async_client: AsyncClient):
    """Verifies fetching an individual hospital and 404 for nonexistent."""
    list_resp = await async_client.get("/hospitals/")
    assert list_resp.status_code == 200
    first_id = list_resp.json()[0]["id"]

    get_resp = await async_client.get(f"/hospitals/{first_id}")
    assert get_resp.status_code == 200
    hosp = get_resp.json()
    assert hosp["id"] == first_id

    # 404 test
    not_found_resp = await async_client.get("/hospitals/nonexistent-id-999")
    assert not_found_resp.status_code == 404
