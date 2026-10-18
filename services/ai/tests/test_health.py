from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "mock" in data
    assert "model" in data
    assert "model_available" in data
    assert data["compute_location"] == "hosted on AMD Token Factory"
    assert "gpu" in data
    assert "stt_model" in data
    assert "embed_model" in data
    assert "X-Request-ID" in response.headers


def test_root_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "CareBridge AI"
    assert "X-Request-ID" in response.headers
