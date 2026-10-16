from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.appointment import Hospital
from app.schemas.hospital import HospitalResponse

router = APIRouter(prefix="/hospitals", tags=["Hospitals & Navigation"])

SYNTHETIC_HOSPITALS = [
    {
        "name": "Apollo Speciality Hospital (Greams Road)",
        "address": "21 Greams Lane, Thousand Lights, Chennai, Tamil Nadu 600006",
        "latitude": 13.0569,
        "longitude": 80.2526,
        "contact_number": "+91-44-2829-0200",
        "emergency_available": True,
        "bed_capacity": 550,
        "beds_available": 42,
        "icu_capacity": 60,
        "icu_available": 8,
        "status": "normal",
        "wait_time_minutes": 15,
        "is_simulated": True,
    },
    {
        "name": "Rajiv Gandhi Government General Hospital (RGGGH)",
        "address": "EVR Periyar Salai, Park Town, Chennai, Tamil Nadu 600003",
        "latitude": 13.0827,
        "longitude": 80.2785,
        "contact_number": "+91-44-2530-5000",
        "emergency_available": True,
        "bed_capacity": 2722,
        "beds_available": 185,
        "icu_capacity": 150,
        "icu_available": 12,
        "status": "busy",
        "wait_time_minutes": 35,
        "is_simulated": True,
    },
    {
        "name": "MIOT International",
        "address": "4/112 Mount Poonamallee Road, Manapakkam, Chennai, Tamil Nadu 600089",
        "latitude": 13.0182,
        "longitude": 80.1834,
        "contact_number": "+91-44-4200-2288",
        "emergency_available": True,
        "bed_capacity": 1000,
        "beds_available": 90,
        "icu_capacity": 120,
        "icu_available": 14,
        "status": "normal",
        "wait_time_minutes": 20,
        "is_simulated": True,
    },
    {
        "name": "Fortis Malar Hospital",
        "address": "52 1st Main Rd, Gandhi Nagar, Adyar, Chennai, Tamil Nadu 600020",
        "latitude": 13.0067,
        "longitude": 80.2571,
        "contact_number": "+91-44-4289-2222",
        "emergency_available": True,
        "bed_capacity": 180,
        "beds_available": 18,
        "icu_capacity": 30,
        "icu_available": 3,
        "status": "busy",
        "wait_time_minutes": 25,
        "is_simulated": True,
    },
    {
        "name": "Kauvery Hospital (Alwarpet)",
        "address": "199 Luz Church Road, Alwarpet, Chennai, Tamil Nadu 600004",
        "latitude": 13.0366,
        "longitude": 80.2543,
        "contact_number": "+91-44-4000-6000",
        "emergency_available": True,
        "bed_capacity": 200,
        "beds_available": 28,
        "icu_capacity": 35,
        "icu_available": 6,
        "status": "normal",
        "wait_time_minutes": 10,
        "is_simulated": True,
    },
]


@router.get("/", response_model=list[HospitalResponse])
async def list_hospitals(db: AsyncSession = Depends(get_db)):
    """Lists hospitals with emergency capacity, bed count, and location for the interactive map."""
    res = await db.execute(select(Hospital))
    hospitals = res.scalars().all()
    if not hospitals:
        # Auto-seed synthetic hospitals for development/demo
        for data in SYNTHETIC_HOSPITALS:
            h = Hospital(**data, last_updated=datetime.utcnow())
            db.add(h)
        await db.commit()
        res = await db.execute(select(Hospital))
        hospitals = res.scalars().all()
    return hospitals


@router.get("/{hospital_id}", response_model=HospitalResponse)
async def get_hospital(hospital_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Hospital).where(Hospital.id == hospital_id))
    h = res.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=404, detail="Hospital not found.")
    return h
