import math
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.appointment import Hospital
from app.schemas.hospital import HospitalCapacityUpdate, HospitalResponse

router = APIRouter(prefix="/hospitals", tags=["Hospitals & Capacity Monitoring"])


def calculate_haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two GPS coordinates in kilometers."""
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(radius_km * c, 2)


SYNTHETIC_HOSPITALS = [
    {
        "name": "Apollo Speciality Hospital (Greams Road)",
        "address": "21 Greams Lane, Thousand Lights, Chennai, Tamil Nadu 600006",
        "latitude": 13.0569,
        "longitude": 80.2526,
        "contact_number": "+91-44-2829-0200",
        "emergency_available": True,
        "emergency_status": "24/7 Active Admission",
        "bed_capacity": 550,
        "beds_available": 42,
        "icu_capacity": 60,
        "icu_available": 8,
        "status": "normal",
        "wait_time_minutes": 15,
        "facilities": [
            "24/7 Emergency & Trauma",
            "Cardiology Cath Lab",
            "ICU & CCU",
            "Blood Bank",
            "Ambulance Fleet",
            "Emergency Stroke Unit",
        ],
        "is_simulated": True,
        "data_source": "Tamil Nadu 108 Emergency Network Telemetry (Simulated)",
        "data_source_type": "simulated",
    },
    {
        "name": "Rajiv Gandhi Government General Hospital (RGGGH)",
        "address": "EVR Periyar Salai, Park Town, Chennai, Tamil Nadu 600003",
        "latitude": 13.0827,
        "longitude": 80.2785,
        "contact_number": "+91-44-2530-5000",
        "emergency_available": True,
        "emergency_status": "High Influx - Trauma & Resuscitation Priority",
        "bed_capacity": 2722,
        "beds_available": 185,
        "icu_capacity": 150,
        "icu_available": 12,
        "status": "busy",
        "wait_time_minutes": 35,
        "facilities": [
            "24/7 Level 1 Trauma Center",
            "Mass Casualty Resuscitation",
            "Free Emergency Dialysis",
            "Regional Blood Bank",
            "Burn Unit",
            "Pediatric Emergency",
        ],
        "is_simulated": True,
        "data_source": "Government Hospital Triage Desk (Simulated)",
        "data_source_type": "simulated",
    },
    {
        "name": "MIOT International",
        "address": "4/112 Mount Poonamallee Road, Manapakkam, Chennai, Tamil Nadu 600089",
        "latitude": 13.0182,
        "longitude": 80.1834,
        "contact_number": "+91-44-4200-2288",
        "emergency_available": True,
        "emergency_status": "24/7 Active Admission",
        "bed_capacity": 1000,
        "beds_available": 90,
        "icu_capacity": 120,
        "icu_available": 14,
        "status": "normal",
        "wait_time_minutes": 20,
        "facilities": [
            "24/7 Emergency Care",
            "Polytrauma & Orthopedics",
            "Emergency Helipad",
            "Hyperbaric Oxygen Chamber",
            "Surgical ICU",
            "Cardiac Critical Care",
        ],
        "is_simulated": False,
        "data_source": "Verified Hospital Partner Telemetry API",
        "data_source_type": "verified",
    },
    {
        "name": "Fortis Malar Hospital",
        "address": "52 1st Main Rd, Gandhi Nagar, Adyar, Chennai, Tamil Nadu 600020",
        "latitude": 13.0067,
        "longitude": 80.2571,
        "contact_number": "+91-44-4289-2222",
        "emergency_available": True,
        "emergency_status": "Admissions Open - Capacity Telemetry Stale",
        "bed_capacity": 180,
        "beds_available": 18,
        "icu_capacity": 30,
        "icu_available": 3,
        "status": "busy",
        "wait_time_minutes": 25,
        "facilities": [
            "24/7 Emergency Center",
            "Interventional Cardiology",
            "Pediatric ICU",
            "24/7 Pharmacy",
            "Advanced Life Support Ambulances",
        ],
        "is_simulated": True,
        "data_source": "State Trauma Registry Feed (>2h Stale)",
        "data_source_type": "outdated",
    },
    {
        "name": "Kauvery Hospital (Alwarpet)",
        "address": "199 Luz Church Road, Alwarpet, Chennai, Tamil Nadu 600004",
        "latitude": 13.0366,
        "longitude": 80.2543,
        "contact_number": "+91-44-4000-6000",
        "emergency_available": True,
        "emergency_status": "24/7 Active Admission",
        "bed_capacity": 200,
        "beds_available": 28,
        "icu_capacity": 35,
        "icu_available": 6,
        "status": "normal",
        "wait_time_minutes": 10,
        "facilities": [
            "24/7 Acute Care Emergency",
            "Neuro ICU",
            "Cardiac Emergency",
            "Emergency Ambulance Dispatch",
            "Day Care Surgery",
        ],
        "is_simulated": True,
        "data_source": "Hospital Emergency Desk Telemetry (Simulated)",
        "data_source_type": "simulated",
    },
    {
        "name": "Ganga Hospital",
        "address": "313 Mettupalayam Road, Saibaba Colony, Coimbatore, Tamil Nadu 641043",
        "latitude": 11.0218,
        "longitude": 76.9498,
        "contact_number": "+91-422-248-5000",
        "emergency_available": True,
        "emergency_status": "24/7 Active Admission",
        "bed_capacity": 500,
        "beds_available": 45,
        "icu_capacity": 50,
        "icu_available": 7,
        "status": "normal",
        "wait_time_minutes": 15,
        "facilities": [
            "24/7 Level 1 Trauma Center",
            "Plastic & Reconstructive Surgery",
            "Burn ICU",
            "Rehabilitation Center",
            "Emergency Blood Storage",
        ],
        "is_simulated": True,
        "data_source": "Coimbatore Regional Medical Registry (Simulated)",
        "data_source_type": "simulated",
    },
    {
        "name": "Meenakshi Mission Hospital & Research Centre",
        "address": "Melur Road, Lake Area, Madurai, Tamil Nadu 625107",
        "latitude": 9.9458,
        "longitude": 78.1528,
        "contact_number": "+91-452-258-8741",
        "emergency_available": True,
        "emergency_status": "Critical Volume - ED Bed Shortage / Diversion Risk",
        "bed_capacity": 800,
        "beds_available": 4,
        "icu_capacity": 90,
        "icu_available": 1,
        "status": "critical",
        "wait_time_minutes": 65,
        "facilities": [
            "24/7 Emergency Department",
            "Cardiovascular Cath Lab",
            "Surgical Oncology",
            "Neuro Trauma ICU",
            "Mobile ICU Ambulances",
        ],
        "is_simulated": True,
        "data_source": "District Health Surveillance Feed (Simulated)",
        "data_source_type": "simulated",
    },
    {
        "name": "Apollo Speciality Hospital (Trichy)",
        "address": "Trichy - Melur Road, Old Palpannai, Tiruchirappalli, Tamil Nadu 620005",
        "latitude": 10.8122,
        "longitude": 78.7047,
        "contact_number": "+91-431-407-7777",
        "emergency_available": True,
        "emergency_status": "24/7 Active Admission",
        "bed_capacity": 250,
        "beds_available": 32,
        "icu_capacity": 40,
        "icu_available": 5,
        "status": "normal",
        "wait_time_minutes": 15,
        "facilities": [
            "24/7 Emergency Services",
            "Critical Care Medicine",
            "Dialysis Unit",
            "Emergency Ambulance",
            "24/7 Pathology Lab",
        ],
        "is_simulated": True,
        "data_source": "Central TN Healthcare Feed (Simulated)",
        "data_source_type": "simulated",
    },
    {
        "name": "Suburban Community Health & Urgent Care Center",
        "address": "Old Thanjavur Road, Kattur, Tiruchirappalli, Tamil Nadu 620019",
        "latitude": 10.7954,
        "longitude": 78.7321,
        "contact_number": "+91-431-255-1234",
        "emergency_available": False,
        "emergency_status": "Telemetry Offline - Intake Call Required",
        "bed_capacity": None,
        "beds_available": None,
        "icu_capacity": None,
        "icu_available": None,
        "status": "unknown",
        "wait_time_minutes": None,
        "facilities": [
            "Outpatient Consultations",
            "Minor Injury Treatment",
            "Basic Pharmacy",
        ],
        "is_simulated": True,
        "data_source": "Offline / Telemetry Unavailable",
        "data_source_type": "unavailable",
    },
]


@router.get("/", response_model=list[HospitalResponse])
async def list_hospitals(
    query: str | None = Query(None, description="Search by name, address, or facility"),
    emergency_only: bool | None = Query(None, description="Filter for 24/7 active emergency"),
    facility: str | None = Query(None, description="Filter by specific facility"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status (normal, busy, critical)"),
    data_source_type: str | None = Query(None, description="Filter by telemetry source type"),
    lat: float | None = Query(None, description="User latitude for proximity sorting"),
    lon: float | None = Query(None, description="User longitude for proximity sorting"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Lists healthcare facilities with emergency status, bed/ICU telemetry, and freshness for interactive monitoring."""
    res = await db.execute(select(Hospital))
    hospitals = list(res.scalars().all())

    if not hospitals:
        # Auto-seed synthetic hospitals for development/demo
        for data in SYNTHETIC_HOSPITALS:
            h = Hospital(**data, last_updated=datetime.now(UTC))
            db.add(h)
        await db.commit()
        res = await db.execute(select(Hospital))
        hospitals = list(res.scalars().all())

    # In-memory filtering for search & facilities
    filtered = hospitals
    if query:
        q_clean = query.lower().strip()
        filtered = [
            h
            for h in filtered
            if q_clean in h.name.lower()
            or q_clean in h.address.lower()
            or any(q_clean in f.lower() for f in (h.facilities or []))
        ]

    if emergency_only:
        filtered = [h for h in filtered if h.emergency_available and h.status != "critical"]

    if facility:
        f_clean = facility.lower().strip()
        filtered = [
            h for h in filtered if any(f_clean in f.lower() for f in (h.facilities or []))
        ]

    if status_filter and status_filter != "all":
        filtered = [h for h in filtered if h.status.lower() == status_filter.lower()]

    if data_source_type and data_source_type != "all":
        filtered = [h for h in filtered if h.data_source_type.lower() == data_source_type.lower()]

    # Compute distances if lat/lon provided
    results = []
    for h in filtered:
        dist = None
        if lat is not None and lon is not None:
            dist = calculate_haversine_km(lat, lon, h.latitude, h.longitude)

        resp_data = HospitalResponse.model_validate(h)
        resp_data.distance_km = dist
        results.append(resp_data)

    if lat is not None and lon is not None:
        results.sort(key=lambda x: (x.distance_km is None, x.distance_km))

    return results


@router.get("/{hospital_id}", response_model=HospitalResponse)
async def get_hospital(hospital_id: str, db: AsyncSession = Depends(get_db)) -> Any:
    """Retrieve details and real-time crowd telemetry for a single hospital."""
    res = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    h = res.scalar_one_or_none()
    if not h:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital not found.",
        )
    return HospitalResponse.model_validate(h)


@router.patch("/{hospital_id}/capacity", response_model=HospitalResponse)
async def update_hospital_capacity(
    hospital_id: str,
    payload: HospitalCapacityUpdate,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Updates hospital capacity telemetry, crowd status, wait times, or data-source metadata."""
    res = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    h = res.scalar_one_or_none()
    if not h:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(h, field, val)

    h.last_updated = datetime.now(UTC)
    await db.commit()
    await db.refresh(h)
    return HospitalResponse.model_validate(h)


@router.post("/{hospital_id}/simulate-crowd", response_model=HospitalResponse)
async def simulate_hospital_crowd(
    hospital_id: str,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Simulates a crowd surge or replenishment cycle for live hackathon demonstration.

    Transitions:
    - normal -> busy (increased wait time, reduced available beds)
    - busy -> critical (emergency department surge, acute bed shortage)
    - critical -> normal (replenishment / shift transition)
    - unknown -> normal
    """
    res = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    h = res.scalar_one_or_none()
    if not h:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital not found.",
        )

    current_status = h.status.lower()
    bed_cap = h.bed_capacity or 100
    icu_cap = h.icu_capacity or 20

    if current_status == "normal":
        h.status = "busy"
        h.beds_available = max(3, int(bed_cap * 0.12))
        h.icu_available = max(1, int(icu_cap * 0.10))
        h.wait_time_minutes = 35
        h.emergency_status = "High Patient Volume - Moderate Wait"
        h.data_source = "Demo Crowd Surge Trigger"
        h.data_source_type = "simulated"
    elif current_status == "busy":
        h.status = "critical"
        h.beds_available = max(1, int(bed_cap * 0.03))
        h.icu_available = 1
        h.wait_time_minutes = 60
        h.emergency_status = "Critical Volume - ED Bed Shortage / Diversion Risk"
        h.data_source = "Demo Emergency Surge Trigger"
        h.data_source_type = "simulated"
    else:
        # From critical or unknown back to normal
        h.status = "normal"
        h.beds_available = max(15, int(bed_cap * 0.25))
        h.icu_available = max(4, int(icu_cap * 0.30))
        h.wait_time_minutes = 15
        h.emergency_status = "24/7 Active Admission - Normal Flow"
        h.data_source = "Demo Capacity Replenishment Trigger"
        h.data_source_type = "simulated"

    h.last_updated = datetime.now(UTC)
    await db.commit()
    await db.refresh(h)
    return HospitalResponse.model_validate(h)


@router.post("/simulate-batch-update")
async def simulate_batch_capacity_update(
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Updates timestamps and micro-fluctuates telemetry across all hospitals for live demo simulation."""
    res = await db.execute(select(Hospital))
    hospitals = list(res.scalars().all())

    if not hospitals:
        for data in SYNTHETIC_HOSPITALS:
            h = Hospital(**data, last_updated=datetime.now(UTC))
            db.add(h)
        await db.commit()
        res = await db.execute(select(Hospital))
        hospitals = list(res.scalars().all())

    updated = 0
    now = datetime.now(UTC)
    for h in hospitals:
        if h.bed_capacity and h.beds_available is not None:
            # Small jitter (+/- 1 or 2 beds)
            delta = 1 if (updated % 2 == 0) else -1
            new_beds = max(1, min(h.bed_capacity, h.beds_available + delta))
            h.beds_available = new_beds
        h.last_updated = now
        updated += 1

    await db.commit()
    return {
        "message": "Capacity telemetry batch updated successfully.",
        "updated_count": updated,
        "timestamp": now.isoformat(),
    }
