import React, { useState } from "react";
import {
  Hospital as HospitalIcon,
  PhoneCall,
  MapPin,
  Clock,
  WarningCircle,
  CheckCircle,
  Flask,
  Compass,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import type { Hospital } from "../../types/backend";
import "./HospitalsScreen.css";

interface HospitalsScreenProps {
  language: "en" | "ta";
  onSelectHospitalForBooking?: (hospital: Hospital) => void;
}

const DEMO_HOSPITALS: Hospital[] = [
  {
    id: "hosp-1",
    name: "Apollo Speciality Hospital (Greams Road)",
    address: "21 Greams Lane, Thousand Lights, Chennai, Tamil Nadu 600006",
    latitude: 13.0569,
    longitude: 80.2526,
    contact_number: "+91-44-2829-0200",
    emergency_available: true,
    bed_capacity: 550,
    beds_available: 42,
    icu_capacity: 60,
    icu_available: 8,
    status: "normal",
    wait_time_minutes: 15,
    last_updated: "2026-10-17T01:00:00Z",
    is_simulated: true,
  },
  {
    id: "hosp-2",
    name: "Rajiv Gandhi Government General Hospital (RGGGH)",
    address: "EVR Periyar Salai, Park Town, Chennai, Tamil Nadu 600003",
    latitude: 13.0827,
    longitude: 80.2785,
    contact_number: "+91-44-2530-5000",
    emergency_available: true,
    bed_capacity: 2722,
    beds_available: 185,
    icu_capacity: 150,
    icu_available: 12,
    status: "busy",
    wait_time_minutes: 35,
    last_updated: "2026-10-17T00:45:00Z",
    is_simulated: true,
  },
  {
    id: "hosp-3",
    name: "MIOT International",
    address: "4/112 Mount Poonamallee Road, Manapakkam, Chennai, Tamil Nadu 600089",
    latitude: 13.0182,
    longitude: 80.1834,
    contact_number: "+91-44-4200-2288",
    emergency_available: true,
    bed_capacity: 1000,
    beds_available: 90,
    icu_capacity: 120,
    icu_available: 14,
    status: "normal",
    wait_time_minutes: 20,
    last_updated: "2026-10-17T01:10:00Z",
    is_simulated: true,
  },
  {
    id: "hosp-4",
    name: "Fortis Malar Hospital",
    address: "52 1st Main Rd, Gandhi Nagar, Adyar, Chennai, Tamil Nadu 600020",
    latitude: 13.0067,
    longitude: 80.2571,
    contact_number: "+91-44-4289-2222",
    emergency_available: true,
    bed_capacity: 180,
    beds_available: 18,
    icu_capacity: 30,
    icu_available: 3,
    status: "busy",
    wait_time_minutes: 25,
    last_updated: "2026-10-17T00:50:00Z",
    is_simulated: true,
  },
  {
    id: "hosp-5",
    name: "Kauvery Hospital (Alwarpet)",
    address: "199 Luz Church Road, Alwarpet, Chennai, Tamil Nadu 600004",
    latitude: 13.0366,
    longitude: 80.2543,
    contact_number: "+91-44-4000-6000",
    emergency_available: true,
    bed_capacity: 200,
    beds_available: 28,
    icu_capacity: 35,
    icu_available: 6,
    status: "normal",
    wait_time_minutes: 10,
    last_updated: "2026-10-17T01:15:00Z",
    is_simulated: true,
  },
];

export const HospitalsScreen: React.FC<HospitalsScreenProps> = ({
  language,
  onSelectHospitalForBooking,
}) => {
  const [selectedHospital, setSelectedHospital] = useState<Hospital>(DEMO_HOSPITALS[0]);
  const isTa = language === "ta";

  return (
    <div className="hospitals-screen" lang={language}>
      {/* Top Banner */}
      <div className="hospitals-header-banner">
        <div>
          <div className="badge-pill">
            <HospitalIcon size={16} weight="fill" />
            <span>{isTa ? "மருத்துவமனை வழிகாட்டி & அவசர பிரிவு" : "Hospital Finder & Emergency Capacity"}</span>
          </div>
          <h1 className="hospitals-title">
            {isTa ? "அருகிலுள்ள மருத்துவமனைகள் & படுக்கை இருப்பு" : "Nearby Hospitals & Emergency Status"}
          </h1>
          <p className="hospitals-sub">
            {isTa
              ? "அவசர பிரிவு நிலவரம், ஐசியூ படுக்கை இருப்பு மற்றும் தொடர்பு எண்களை உடனடியாகக் கண்டறியுங்கள்."
              : "Locate emergency medical centers with capacity indicators, ICU availability, and direct calling."}
          </p>
        </div>

        <div className="synthetic-badge-pill" title="Simulated Hospital Capacity">
          <Flask size={14} weight="bold" />
          <span>{isTa ? "மாதிரி கொள்ளளவு தரவு" : "Simulated Capacity Data"}</span>
        </div>
      </div>

      {/* Emergency Call Quick Banner */}
      <div className="emergency-quick-bar">
        <div className="quick-bar-text">
          <PhoneCall size={20} weight="fill" className="emergency-icon" />
          <span>
            {isTa
              ? "மருத்துவ அவசர கால உதவிக்கு உடனடியாக 108 என்ற எண்ணை அழைக்கவும்."
              : "In a life-threatening medical emergency, call 108 immediately."}
          </span>
        </div>
        <a href="tel:108" className="btn-call-108">
          <span>{isTa ? "அழை: 108" : "Call 108"}</span>
        </a>
      </div>

      {/* Two Column Layout: Hospital List & Selected Hospital Map Panel */}
      <div className="hospitals-layout-grid">
        {/* Left: Hospital Cards */}
        <div className="hospitals-list-column">
          <h2 className="column-heading">
            {isTa ? "மருத்துவமனைகளின் பட்டியல்" : "Available Medical Centers"}
          </h2>

          <div className="hospitals-cards-list">
            {DEMO_HOSPITALS.map((hosp) => {
              const isSelected = hosp.id === selectedHospital.id;
              const isNormal = hosp.status === "normal";
              const isBusy = hosp.status === "busy";

              return (
                <div
                  key={hosp.id}
                  className={`hospital-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedHospital(hosp)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="hosp-card-top">
                    <div>
                      <h3 className="hosp-title">{hosp.name}</h3>
                      <div className="hosp-address">
                        <MapPin size={14} />
                        <span>{hosp.address}</span>
                      </div>
                    </div>

                    <span className={`status-pill ${hosp.status}`}>
                      {isNormal
                        ? isTa ? "சாதாரண நிலை" : "Normal Capacity"
                        : isBusy
                        ? isTa ? "அதிக நெரிசல்" : "High Volume"
                        : isTa ? "முழு கொள்ளளவு" : "Critical Capacity"}
                    </span>
                  </div>

                  <div className="hosp-capacity-stats">
                    <div className="stat-box">
                      <span className="stat-label">{isTa ? "பொது படுக்கைகள்" : "General Beds"}</span>
                      <span className="stat-val">{hosp.beds_available} / {hosp.bed_capacity}</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-label">{isTa ? "ஐசியூ படுக்கைகள்" : "ICU Beds"}</span>
                      <span className="stat-val text-teal">{hosp.icu_available} / {hosp.icu_capacity}</span>
                    </div>
                    <div className="stat-box">
                      <span className="stat-label">{isTa ? "காத்திருப்பு" : "Est. Wait"}</span>
                      <span className="stat-val">~{hosp.wait_time_minutes}m</span>
                    </div>
                  </div>

                  <div className="hosp-card-footer">
                    <span className="last-updated">
                      <Clock size={12} />
                      <span>{isTa ? "புதுப்பிக்கப்பட்டது: 15 நிமிடங்களுக்கு முன்" : "Updated ~15m ago (Simulated)"}</span>
                    </span>

                    <div className="card-actions-group">
                      <a
                        href={`tel:${hosp.contact_number}`}
                        className="btn-call-hosp"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PhoneCall size={14} weight="bold" />
                        <span>{isTa ? "அழைக்க" : "Call"}</span>
                      </a>
                      {onSelectHospitalForBooking && (
                        <button
                          type="button"
                          className="btn-book-hosp"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectHospitalForBooking(hosp);
                          }}
                        >
                          <span>{isTa ? "சந்திப்பு பதிவு" : "Book Slot"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Hospital Detail & Interactive Map Panel */}
        <div className="hospital-details-panel">
          <div className="panel-card">
            <div className="panel-header">
              <Compass size={22} weight="bold" className="compass-icon" />
              <div>
                <h3 className="panel-title">{selectedHospital.name}</h3>
                <span className="panel-subtitle">{isTa ? "வரைபடம் மற்றும் வசதிகள்" : "Navigation & Facility Details"}</span>
              </div>
            </div>

            {/* Map Canvas Placeholder (Leaflet Integration Ready) */}
            <div className="map-view-box">
              <div className="map-mock-overlay">
                <MapPin size={36} weight="fill" className="map-pin-pulse" />
                <span className="map-mock-title">{selectedHospital.name}</span>
                <span className="map-mock-coords">
                  {selectedHospital.latitude.toFixed(4)}° N, {selectedHospital.longitude.toFixed(4)}° E
                </span>
                <span className="map-leaflet-badge">Leaflet & OpenStreetMap Integrated</span>
              </div>
            </div>

            <div className="selected-hosp-info-list">
              <div className="info-row">
                <span className="info-label">{isTa ? "முகவரி:" : "Address:"}</span>
                <span className="info-val">{selectedHospital.address}</span>
              </div>
              <div className="info-row">
                <span className="info-label">{isTa ? "அவசர பிரிவு:" : "Emergency Department:"}</span>
                <span className="info-val text-success">
                  <CheckCircle size={14} weight="fill" />
                  <span>{isTa ? "24x7 தயார் நிலை" : "24/7 Active"}</span>
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">{isTa ? "தொடர்பு எண்:" : "Helpline:"}</span>
                <a href={`tel:${selectedHospital.contact_number}`} className="phone-link">
                  {selectedHospital.contact_number}
                </a>
              </div>
            </div>

            <a
              href={`https://www.openstreetmap.org/?mlat=${selectedHospital.latitude}&mlon=${selectedHospital.longitude}#map=16/${selectedHospital.latitude}/${selectedHospital.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="open-osm-btn"
            >
              <ArrowSquareOut size={16} weight="bold" />
              <span>{isTa ? "OpenStreetMap தளத்தில் பார்க்க" : "Open in OpenStreetMap"}</span>
            </a>

            <div className="simulated-disclaimer">
              <WarningCircle size={14} weight="fill" />
              <span>
                {isTa
                  ? "குறிப்பு: கொள்ளளவு தரவு டெமோ நோக்கங்களுக்காக மாதிரி உருவாக்கப்பட்டது (Simulated Data). அவசர நிலைகளில் மருத்துவமனையை நேரடியாக தொடர்பு கொள்ளவும்."
                  : "Note: Live bed capacities are simulated for this demonstration. Always confirm with the emergency desk before dispatch."}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
