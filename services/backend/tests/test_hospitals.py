import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_hospitals_auto_seeds(async_client: AsyncClient):
    """Verifies hospital list auto-seeds synthetic facilities and includes capacity monitoring fields."""
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
    assert "emergency_status" in first
    assert "data_source" in first
    assert "data_source_type" in first
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
async def test_filter_hospitals_by_status_and_source(async_client: AsyncClient):
    """Verifies filtering hospitals by crowd status and data source type."""
    # Filter by normal
    resp_norm = await async_client.get("/hospitals/?status=normal")
    assert resp_norm.status_code == 200
    norm_data = resp_norm.json()
    assert len(norm_data) >= 1
    assert all(h["status"] == "normal" for h in norm_data)

    # Filter by verified source
    resp_ver = await async_client.get("/hospitals/?data_source_type=verified")
    assert resp_ver.status_code == 200
    ver_data = resp_ver.json()
    assert len(ver_data) >= 1
    assert all(h["data_source_type"] == "verified" for h in ver_data)


@pytest.mark.asyncio
async def test_hospitals_distance_calculation(async_client: AsyncClient):
    """Verifies distance calculation and sorting when user GPS coordinates are provided."""
    response = await async_client.get("/hospitals/?lat=13.0569&lon=80.2526")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 5
    assert data[0]["distance_km"] is not None
    assert data[0]["distance_km"] < 1.0
    distances = [h["distance_km"] for h in data if h["distance_km"] is not None]
    assert distances == sorted(distances)


@pytest.mark.asyncio
async def test_patch_hospital_capacity(async_client: AsyncClient):
    """Verifies PATCH /hospitals/{id}/capacity updates bed counts, wait times, and status."""
    list_resp = await async_client.get("/hospitals/")
    hosp = list_resp.json()[0]
    hosp_id = hosp["id"]

    patch_payload = {
        "beds_available": 14,
        "icu_available": 2,
        "status": "busy",
        "wait_time_minutes": 40,
        "emergency_status": "Severe ED Surge",
        "data_source": "Staff Manual Override",
        "data_source_type": "verified",
    }
    patch_resp = await async_client.patch(f"/hospitals/{hosp_id}/capacity", json=patch_payload)
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["beds_available"] == 14
    assert updated["icu_available"] == 2
    assert updated["status"] == "busy"
    assert updated["wait_time_minutes"] == 40
    assert updated["emergency_status"] == "Severe ED Surge"
    assert updated["data_source"] == "Staff Manual Override"
    assert updated["data_source_type"] == "verified"


@pytest.mark.asyncio
async def test_simulate_crowd_cycle(async_client: AsyncClient):
    """Verifies POST /hospitals/{id}/simulate-crowd cycles crowd state for demo."""
    list_resp = await async_client.get("/hospitals/")
    hosp = list_resp.json()[0]
    hosp_id = hosp["id"]

    # First cycle
    sim_resp_1 = await async_client.post(f"/hospitals/{hosp_id}/simulate-crowd")
    assert sim_resp_1.status_code == 200
    data_1 = sim_resp_1.json()
    assert data_1["status"] in ["busy", "critical", "normal"]
    assert "Demo" in data_1["data_source"]

    # Subsequent cycle
    sim_resp_2 = await async_client.post(f"/hospitals/{hosp_id}/simulate-crowd")
    assert sim_resp_2.status_code == 200


@pytest.mark.asyncio
async def test_simulate_batch_capacity_update(async_client: AsyncClient):
    """Verifies POST /hospitals/simulate-batch-update updates telemetric timestamps."""
    batch_resp = await async_client.post("/hospitals/simulate-batch-update")
    assert batch_resp.status_code == 200
    batch_data = batch_resp.json()
    assert "updated_count" in batch_data
    assert batch_data["updated_count"] >= 5
    assert "timestamp" in batch_data


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
