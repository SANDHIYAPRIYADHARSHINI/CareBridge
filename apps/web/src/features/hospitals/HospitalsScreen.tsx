import React, { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  MagnifyingGlass,
  Funnel,
  FirstAid,
  X,
} from "@phosphor-icons/react";
import type { Hospital } from "../../types/backend";
import { getHospitals } from "../../services/api";
import "./HospitalsScreen.css";

interface HospitalsScreenProps {
  language: "en" | "ta";
  onSelectHospitalForBooking?: (hospital: Hospital) => void;
}

interface UserLocation {
  lat: number;
  lon: number;
  label: string;
}

const CITY_PRESETS = [
  { id: "chennai-central", name: "Chennai (Central / Greams)", nameTa: "சென்னை (கிரீம்ஸ்)", lat: 13.0569, lon: 80.2526 },
  { id: "chennai-south", name: "South Chennai (Adyar / OMR)", nameTa: "தென் சென்னை (அடையார்)", lat: 13.0067, lon: 80.2571 },
  { id: "coimbatore", name: "Coimbatore", nameTa: "கோயம்புத்தூர்", lat: 11.0168, lon: 76.9558 },
  { id: "madurai", name: "Madurai", nameTa: "மதுரை", lat: 9.9458, lon: 78.1528 },
  { id: "trichy", name: "Tiruchirappalli", nameTa: "திருச்சிராப்பள்ளி", lat: 10.8122, lon: 78.7047 },
];

const FALLBACK_HOSPITALS: Hospital[] = [
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
    facilities: [
      "24/7 Emergency & Trauma",
      "Cardiology Cath Lab",
      "ICU & CCU",
      "Blood Bank",
      "Ambulance Fleet",
      "Emergency Stroke Unit",
    ],
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
    facilities: [
      "Level 1 Trauma Center",
      "24/7 Casualty & Resuscitation",
      "Burn ICU",
      "Nephrology & Dialysis",
      "Government Blood Bank",
      "24/7 Jan Aushadhi Pharmacy",
    ],
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
    facilities: [
      "24/7 Emergency & Critical Care",
      "Orthopedic Trauma & Joint Replacement",
      "Cardiac Care Unit",
      "Helipad for Air Ambulance",
      "Advanced Imaging (PET/CT)",
    ],
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
    facilities: [
      "24/7 Cardiac Emergency",
      "Heart Failure & Transplant Center",
      "Intensive Coronary Care Unit (ICCU)",
      "Pediatric ICU",
    ],
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
    facilities: [
      "24/7 Rapid Emergency Response",
      "Comprehensive Geriatric Care",
      "Neurocritical ICU",
      "Day Care Dialysis",
    ],
    last_updated: "2026-10-17T01:15:00Z",
    is_simulated: true,
  },
  {
    id: "hosp-6",
    name: "PSG Hospitals (Coimbatore)",
    address: "Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu 641004",
    latitude: 11.0267,
    longitude: 77.0028,
    contact_number: "+91-422-257-0170",
    emergency_available: true,
    bed_capacity: 1200,
    beds_available: 110,
    icu_capacity: 140,
    icu_available: 18,
    status: "normal",
    wait_time_minutes: 15,
    facilities: [
      "24/7 Emergency & Poison Center",
      "Advanced Trauma & Stroke Center",
      "Neonatal & Pediatric ICU",
      "Comprehensive Cancer Center",
    ],
    last_updated: "2026-10-17T01:05:00Z",
    is_simulated: true,
  },
  {
    id: "hosp-7",
    name: "Meenakshi Mission Hospital & Research Centre (Madurai)",
    address: "Melur Main Road, Lake Area, Madurai, Tamil Nadu 625107",
    latitude: 9.9458,
    longitude: 78.1528,
    contact_number: "+91-452-258-8741",
    emergency_available: true,
    bed_capacity: 800,
    beds_available: 64,
    icu_capacity: 90,
    icu_available: 11,
    status: "normal",
    wait_time_minutes: 20,
    facilities: [
      "24/7 Emergency Department",
      "Cardiovascular Cath Lab",
      "Surgical Oncology",
      "Neuro Trauma ICU",
      "Mobile ICU Ambulances",
    ],
    last_updated: "2026-10-17T01:00:00Z",
    is_simulated: true,
  },
  {
    id: "hosp-8",
    name: "Apollo Speciality Hospital (Trichy)",
    address: "Trichy - Melur Road, Old Palpannai, Tiruchirappalli, Tamil Nadu 620005",
    latitude: 10.8122,
    longitude: 78.7047,
    contact_number: "+91-431-407-7777",
    emergency_available: true,
    bed_capacity: 250,
    beds_available: 32,
    icu_capacity: 40,
    icu_available: 5,
    status: "normal",
    wait_time_minutes: 15,
    facilities: [
      "24/7 Emergency Services",
      "Critical Care Medicine",
      "Dialysis Unit",
      "Emergency Ambulance",
      "24/7 Pathology Lab",
    ],
    last_updated: "2026-10-17T01:00:00Z",
    is_simulated: true,
  },
];

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const HospitalsScreen: React.FC<HospitalsScreenProps> = ({
  language,
  onSelectHospitalForBooking,
}) => {
  const isTa = language === "ta";

  // Data & State
  const [hospitals, setHospitals] = useState<Hospital[]>(FALLBACK_HOSPITALS);
  const [selectedHospital, setSelectedHospital] = useState<Hospital>(FALLBACK_HOSPITALS[0]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [emergencyOnly, setEmergencyOnly] = useState(false);

  // Geolocation & Fallbacks
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "granted" | "denied" | "unavailable">("idle");
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);

  // Fetch Hospitals from Backend
  const loadHospitals = useCallback(async (loc?: { lat: number; lon: number }) => {
    setLoading(true);
    try {
      const data = await getHospitals({
        query: searchQuery.trim() || undefined,
        emergency_only: emergencyOnly || undefined,
        facility: facilityFilter !== "all" ? facilityFilter : undefined,
        lat: loc?.lat ?? userLocation?.lat,
        lon: loc?.lon ?? userLocation?.lon,
      });

      if (data && data.length > 0) {
        setHospitals(data);
        // Retain selection or select top result
        if (!selectedHospital || !data.some((h) => h.id === selectedHospital.id)) {
          setSelectedHospital(data[0]);
        }
      } else {
        // Local filtering on fallback if backend returns empty
        let filtered = [...FALLBACK_HOSPITALS];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          filtered = filtered.filter(
            (h) =>
              h.name.toLowerCase().includes(q) ||
              h.address.toLowerCase().includes(q) ||
              h.facilities?.some((f) => f.toLowerCase().includes(q))
          );
        }
        if (emergencyOnly) {
          filtered = filtered.filter((h) => h.emergency_available && h.status !== "critical");
        }
        if (facilityFilter !== "all") {
          const fClean = facilityFilter.toLowerCase();
          filtered = filtered.filter((h) =>
            h.facilities?.some((f) => f.toLowerCase().includes(fClean))
          );
        }
        const activeLat = loc?.lat ?? userLocation?.lat;
        const activeLon = loc?.lon ?? userLocation?.lon;
        if (activeLat !== undefined && activeLon !== undefined) {
          filtered = filtered.map((h) => ({
            ...h,
            distance_km: calculateDistanceKm(activeLat, activeLon, h.latitude, h.longitude),
          })).sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
        }
        setHospitals(filtered);
        if (filtered.length > 0) {
          setSelectedHospital(filtered[0]);
        }
      }
    } catch {
      // Seamlessly fall back to client-side list with filter
      let filtered = [...FALLBACK_HOSPITALS];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(
          (h) =>
            h.name.toLowerCase().includes(q) ||
            h.address.toLowerCase().includes(q) ||
            h.facilities?.some((f) => f.toLowerCase().includes(q))
        );
      }
      if (emergencyOnly) {
        filtered = filtered.filter((h) => h.emergency_available && h.status !== "critical");
      }
      if (facilityFilter !== "all") {
        const fClean = facilityFilter.toLowerCase();
        filtered = filtered.filter((h) =>
          h.facilities?.some((f) => f.toLowerCase().includes(fClean))
        );
      }
      const activeLat = loc?.lat ?? userLocation?.lat;
      const activeLon = loc?.lon ?? userLocation?.lon;
      if (activeLat !== undefined && activeLon !== undefined) {
        filtered = filtered.map((h) => ({
          ...h,
          distance_km: calculateDistanceKm(activeLat, activeLon, h.latitude, h.longitude),
        })).sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
      }
      setHospitals(filtered);
      if (filtered.length > 0) {
        setSelectedHospital(filtered[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery, emergencyOnly, facilityFilter, userLocation?.lat, userLocation?.lon, selectedHospital]);

  useEffect(() => {
    loadHospitals();
  }, [loadHospitals]);

  // Handle Location Request (User-initiated only)
  const handleRequestLocation = () => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      setLocationMessage(
        isTa
          ? "உங்கள் உலாவியில் இருப்பிட சேவை கிடைக்கவில்லை. கீழே கொடுக்கப்பட்டுள்ள நகரங்களில் ஒன்றைத் தேர்ந்தெடுக்கவும்."
          : "Geolocation is not supported by your browser. Please select a city preset below."
      );
      return;
    }

    setLocationStatus("requesting");
    setLocationMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const loc = { lat: latitude, lon: longitude, label: isTa ? "உங்கள் இருப்பிடம்" : "Your Location" };
        setUserLocation(loc);
        setLocationStatus("granted");
        setLocationMessage(null);

        // Center map to user
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([latitude, longitude], 13, { duration: 1 });
        }
        loadHospitals(loc);
      },
      (error) => {
        if (error.code === 1) {
          // PERMISSION_DENIED
          setLocationStatus("denied");
          setLocationMessage(
            isTa
              ? "இருப்பிட அனுமதி மறுக்கப்பட்டது. துல்லியமான தூரத்திற்கு கீழே உள்ள நகரங்களில் ஒன்றைத் தேர்ந்தெடுக்கலாம்."
              : "Location access was denied. You can select your city or use the manual search below."
          );
        } else {
          // POSITION_UNAVAILABLE or TIMEOUT
          setLocationStatus("unavailable");
          setLocationMessage(
            isTa
              ? "தற்போதைய இருப்பிடத்தை கண்டறிய இயலவில்லை. கீழே உள்ள நகர குறுக்குவழியைப் பயன்படுத்தவும்."
              : "Unable to retrieve GPS coordinates. Please select a regional city center below."
          );
        }
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  };

  // City preset selection
  const handleSelectCityPreset = (city: typeof CITY_PRESETS[0]) => {
    const loc = {
      lat: city.lat,
      lon: city.lon,
      label: isTa ? city.nameTa : city.name,
    };
    setUserLocation(loc);
    setLocationStatus("granted");
    setLocationMessage(null);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([city.lat, city.lon], 12, { duration: 0.8 });
    }
    loadHospitals(loc);
  };

  // Clear Location
  const handleClearLocation = () => {
    setUserLocation(null);
    setLocationStatus("idle");
    setLocationMessage(null);
    loadHospitals();
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [13.0569, 80.2526],
        zoom: 12,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapInstanceRef.current = map;

      // Invalidate size after layout stabilization
      const timer = setTimeout(() => {
        map.invalidateSize();
      }, 300);
      return () => clearTimeout(timer);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersGroupRef.current = null;
      }
    };
  }, []);

  // Update Markers when hospitals, selectedHospital, or userLocation changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersGroupRef.current) return;
    const markersGroup = markersGroupRef.current;
    markersGroup.clearLayers();

    // 1. User Location Marker
    if (userLocation) {
      const userIcon = L.divIcon({
        className: "leaflet-user-marker",
        html: `<div class="user-loc-dot" title="${userLocation.label}"><div class="user-loc-pulse"></div></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([userLocation.lat, userLocation.lon], { icon: userIcon })
        .bindPopup(`<strong>${userLocation.label}</strong>`)
        .addTo(markersGroup);
    }

    // 2. Hospital Markers
    hospitals.forEach((hosp) => {
      const isSelected = hosp.id === selectedHospital?.id;
      const isCritical = hosp.status === "critical";
      const isBusy = hosp.status === "busy";
      const statusColor = isCritical ? "#ef4444" : isBusy ? "#d97706" : "#0d9488";

      const iconHtml = `
        <div class="custom-marker-wrapper ${isSelected ? "marker-active" : ""}">
          <div class="marker-pin" style="background-color: ${statusColor};">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
              <path d="M19 10.5h-5.5V5c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v5.5H5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h5.5V19c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-5.5H19c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5z"/>
            </svg>
          </div>
          ${isSelected ? '<div class="marker-pulse-ring"></div>' : ""}
        </div>
      `;

      const markerIcon = L.divIcon({
        className: "hospital-div-marker",
        html: iconHtml,
        iconSize: [32, 40],
        iconAnchor: [16, 38],
        popupAnchor: [0, -36],
      });

      const marker = L.marker([hosp.latitude, hosp.longitude], { icon: markerIcon });

      const popupContent = document.createElement("div");
      popupContent.className = "leaflet-popup-card";
      popupContent.innerHTML = `
        <h4 style="margin: 0 0 4px; font-size: 13px; color: #0f172a;">${hosp.name}</h4>
        <span style="display:inline-block; font-size: 10px; font-weight:700; color:${statusColor}; background:${statusColor}15; padding: 2px 6px; border-radius:4px; margin-bottom: 6px;">
          ${hosp.status.toUpperCase()} • ${hosp.emergency_available ? "24/7 EMERGENCY" : "DAYTIME"}
        </span>
        <p style="margin: 0 0 6px; font-size: 11px; color: #64748b; line-height: 1.3;">${hosp.address}</p>
        <div style="font-size: 11px; font-weight: 600; color: #0d9488;">
          ICU Beds: ${hosp.icu_available}/${hosp.icu_capacity} &bull; Beds: ${hosp.beds_available}/${hosp.bed_capacity}
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on("click", () => {
        setSelectedHospital(hosp);
      });

      marker.addTo(markersGroup);
    });
  }, [hospitals, selectedHospital, userLocation]);

  // Pan to selected hospital smoothly
  useEffect(() => {
    if (mapInstanceRef.current && selectedHospital) {
      mapInstanceRef.current.panTo([selectedHospital.latitude, selectedHospital.longitude], {
        animate: true,
        duration: 0.6,
      });
    }
  }, [selectedHospital]);

  return (
    <div className="hospitals-screen" lang={language}>
      {/* Top Header Banner */}
      <div className="hospitals-header-banner">
        <div>
          <div className="badge-pill">
            <HospitalIcon size={16} weight="fill" />
            <span>{isTa ? "மருத்துவமனை வழிகாட்டி & ஊடாடும் வரைபடம்" : "Hospital Finder & Interactive Map"}</span>
          </div>
          <h1 className="hospitals-title">
            {isTa ? "அருகிலுள்ள மருத்துவமனைகள் & அவசர சேவை வரைபடம்" : "Nearby Hospitals & Emergency Map"}
          </h1>
          <p className="hospitals-sub">
            {isTa
              ? "OpenStreetMap வரைபடத்தில் மருத்துவமனைகள், அவசர பிரிவு தயார்நிலை, வசதிகள் மற்றும் படுக்கை இருப்பை காண்க."
              : "Interactive OpenStreetMap navigation showing hospital capacities, trauma facilities, and 1-click emergency contacts."}
          </p>
        </div>

        <div className="synthetic-badge-pill" title="Simulated Hospital Capacity Dataset">
          <Flask size={14} weight="bold" />
          <span>{isTa ? "மாதிரி தரவுத்தளம் (Demo)" : "Synthetic Demo Data"}</span>
        </div>
      </div>

      {/* Emergency Call Quick Bar */}
      <div className="emergency-quick-bar">
        <div className="quick-bar-text">
          <PhoneCall size={22} weight="fill" className="emergency-icon pulse-fast" />
          <div>
            <strong>{isTa ? "அவசர மருத்துவ உதவிக்கு: " : "Immediate Medical Emergency: "}</strong>
            <span>{isTa ? "ஆம்புலன்ஸ் & அவசர உதவிக்கு 108 அழைக்கவும்." : "Dial 108 for emergency ambulance response across Tamil Nadu."}</span>
          </div>
        </div>
        <div className="emergency-quick-actions">
          {selectedHospital && (
            <a href={`tel:${selectedHospital.contact_number}`} className="btn-call-ed">
              <FirstAid size={16} weight="bold" />
              <span>{isTa ? "தேர்ந்தெடுத்த மருத்துவமனைக்கு அழைக்க" : `Call ED: ${selectedHospital.name.split(" ")[0]}`}</span>
            </a>
          )}
          <a href="tel:108" className="btn-call-108">
            <PhoneCall size={16} weight="bold" />
            <span>{isTa ? "அழை: 108" : "Call 108"}</span>
          </a>
        </div>
      </div>

      {/* Search, Location Request, and City Quick Presets */}
      <div className="hospitals-control-card">
        <div className="controls-top-row">
          {/* Search Input */}
          <div className="hospital-search-box">
            <MagnifyingGlass size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder={isTa ? "மருத்துவமனை பெயர், பகுதி அல்லது வசதி தேடுக..." : "Search hospitals, address, or facility (e.g. Cath Lab, Trauma)..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Browser Location Button */}
          <button
            type="button"
            className={`btn-locate-me ${userLocation ? "active" : ""}`}
            onClick={handleRequestLocation}
            disabled={locationStatus === "requesting"}
            title={isTa ? "உங்கள் இருப்பிடத்தைப் பயன்படுத்தி அருகிலுள்ள மருத்துவமனைகளை வரிசைப்படுத்துங்கள்" : "Use GPS location to calculate hospital distance"}
          >
            <Compass size={18} weight="bold" className={locationStatus === "requesting" ? "spinning" : ""} />
            <span>
              {locationStatus === "requesting"
                ? isTa ? "கண்டறிகிறது..." : "Locating..."
                : userLocation
                ? isTa ? "இருப்பிடம் இயக்கப்பட்டது" : "Location Active"
                : isTa ? "என் இருப்பிடம் காண்க" : "Use My Location"}
            </span>
          </button>
        </div>

        {/* Location Notice / Feedback Banner */}
        {locationMessage && (
          <div className={`location-status-banner ${locationStatus}`}>
            <WarningCircle size={16} weight="fill" />
            <span>{locationMessage}</span>
          </div>
        )}

        {/* City Quick Fallback Selectors */}
        <div className="city-fallback-row">
          <span className="city-label">
            <MapPin size={14} />
            <span>{isTa ? "நகரம் / மையம்:" : "Quick Region:"}</span>
          </span>
          <div className="city-pills">
            {CITY_PRESETS.map((city) => {
              const isActive = userLocation?.lat === city.lat && userLocation?.lon === city.lon;
              return (
                <button
                  key={city.id}
                  type="button"
                  className={`city-pill ${isActive ? "active" : ""}`}
                  onClick={() => handleSelectCityPreset(city)}
                >
                  {isTa ? city.nameTa : city.name}
                </button>
              );
            })}
            {userLocation && (
              <button
                type="button"
                className="city-pill reset-pill"
                onClick={handleClearLocation}
              >
                <X size={12} />
                <span>{isTa ? "அனைத்தும்" : "Reset GPS"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Facility and Emergency Filter Pills */}
        <div className="filter-tags-row">
          <span className="filter-label">
            <Funnel size={14} />
            <span>{isTa ? "வடிகட்டி:" : "Filters:"}</span>
          </span>
          <button
            type="button"
            className={`filter-btn ${facilityFilter === "all" && !emergencyOnly ? "active" : ""}`}
            onClick={() => {
              setFacilityFilter("all");
              setEmergencyOnly(false);
            }}
          >
            {isTa ? "அனைத்து மருத்துவமனைகள்" : "All Facilities"}
          </button>
          <button
            type="button"
            className={`filter-btn ${emergencyOnly ? "active" : ""}`}
            onClick={() => setEmergencyOnly(!emergencyOnly)}
          >
            <FirstAid size={14} weight="bold" />
            <span>{isTa ? "24/7 அவசர பிரிவு மட்டும்" : "24/7 Emergency Only"}</span>
          </button>
          <button
            type="button"
            className={`filter-btn ${facilityFilter === "Cath Lab" ? "active" : ""}`}
            onClick={() => setFacilityFilter(facilityFilter === "Cath Lab" ? "all" : "Cath Lab")}
          >
            <span>{isTa ? "இதய கேத் லேப் (Cath Lab)" : "Cardiology / Cath Lab"}</span>
          </button>
          <button
            type="button"
            className={`filter-btn ${facilityFilter === "Trauma" ? "active" : ""}`}
            onClick={() => setFacilityFilter(facilityFilter === "Trauma" ? "all" : "Trauma")}
          >
            <span>{isTa ? "அதிதீவிர அதிர்ச்சி மையம் (Trauma)" : "Trauma Center"}</span>
          </button>
          <button
            type="button"
            className={`filter-btn ${facilityFilter === "Dialysis" ? "active" : ""}`}
            onClick={() => setFacilityFilter(facilityFilter === "Dialysis" ? "all" : "Dialysis")}
          >
            <span>{isTa ? "டயாலிசிஸ் (Dialysis)" : "Dialysis Unit"}</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout: Hospital Cards & Interactive Map + Details Panel */}
      <div className="hospitals-layout-grid">
        {/* Left Column: Hospital List Cards */}
        <div className="hospitals-list-column">
          <div className="list-column-header">
            <h2 className="column-heading">
              {isTa ? "கிடைக்கும் மருத்துவமனைகள்" : "Available Medical Centers"}
            </h2>
            <span className="results-count">
              {hospitals.length} {isTa ? "மருத்துவமனைகள் கண்டறியப்பட்டன" : "facilities found"}
            </span>
          </div>

          {loading ? (
            <div className="loading-state-card">
              <div className="spinner-border" />
              <span>{isTa ? "மருத்துவமனை தகவல்கள் ஏற்றப்படுகின்றன..." : "Loading hospital data and availability..."}</span>
            </div>
          ) : hospitals.length === 0 ? (
            <div className="empty-hospitals-card">
              <HospitalIcon size={40} className="empty-icon" />
              <h3>{isTa ? "மருத்துவமனைகள் காணப்படவில்லை" : "No hospitals match your search criteria"}</h3>
              <p>
                {isTa
                  ? "வேறு பெயர் அல்லது வசதியைத் தேடிப் பாருங்கள் அல்லது வடிகட்டிகளை மீட்டமைக்கவும்."
                  : "Try loosening your search terms or clearing the selected filters."}
              </p>
              <button
                type="button"
                className="btn-reset-filters"
                onClick={() => {
                  setSearchQuery("");
                  setFacilityFilter("all");
                  setEmergencyOnly(false);
                }}
              >
                {isTa ? "வடிகட்டிகளை மீட்டமை" : "Reset All Filters"}
              </button>
            </div>
          ) : (
            <div className="hospitals-cards-list">
              {hospitals.map((hosp) => {
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedHospital(hosp);
                      }
                    }}
                  >
                    <div className="hosp-card-top">
                      <div>
                        <div className="hosp-title-row">
                          <h3 className="hosp-title">{hosp.name}</h3>
                          {hosp.distance_km !== undefined && hosp.distance_km !== null && (
                            <span className="distance-badge">
                              {hosp.distance_km} km
                            </span>
                          )}
                        </div>
                        <div className="hosp-address">
                          <MapPin size={14} className="pin-icon" />
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

                    {/* Facilities Tags Preview */}
                    {hosp.facilities && hosp.facilities.length > 0 && (
                      <div className="hosp-facility-chips">
                        {hosp.facilities.slice(0, 3).map((fac, idx) => (
                          <span key={idx} className="facility-chip">
                            {fac}
                          </span>
                        ))}
                        {hosp.facilities.length > 3 && (
                          <span className="facility-chip more">
                            +{hosp.facilities.length - 3} {isTa ? "கூடுதல்" : "more"}
                          </span>
                        )}
                      </div>
                    )}

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
                        <span>{isTa ? "புதுப்பிக்கப்பட்டது: 15 நிமிடங்களுக்கு முன் (மாதிரி)" : "Updated ~15m ago (Simulated)"}</span>
                      </span>

                      <div className="card-actions-group">
                        <a
                          href={`tel:${hosp.contact_number}`}
                          className="btn-call-hosp"
                          onClick={(e) => e.stopPropagation()}
                          title={`Call ${hosp.contact_number}`}
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
          )}
        </div>

        {/* Right Column: Leaflet Interactive Map & Selected Hospital Details Panel */}
        <div className="hospital-details-panel">
          <div className="panel-card">
            {/* Interactive Leaflet Map Container */}
            <div className="map-view-box">
              <div
                ref={mapContainerRef}
                className="leaflet-map-canvas"
                style={{ width: "100%", height: "100%" }}
              />
              <div className="map-attribution-overlay">
                <span>OpenStreetMap &bull; Leaflet</span>
              </div>
            </div>

            {/* Selected Hospital Detailed Header */}
            <div className="panel-header">
              <Compass size={24} weight="bold" className="compass-icon" />
              <div>
                <h3 className="panel-title">{selectedHospital.name}</h3>
                <span className="panel-subtitle">
                  {selectedHospital.emergency_available
                    ? isTa ? "24 மணி நேர அவசர சிகிச்சைப் பிரிவு தயார்நிலை" : "24/7 Active Emergency & Trauma Center"
                    : isTa ? "பகல்நேர மருத்துவ மையம்" : "Outpatient Medical Facility"}
                </span>
              </div>
            </div>

            {/* Key Information Rows */}
            <div className="selected-hosp-info-list">
              <div className="info-row">
                <span className="info-label">{isTa ? "முகவரி:" : "Address:"}</span>
                <span className="info-val">{selectedHospital.address}</span>
              </div>

              {selectedHospital.distance_km !== undefined && selectedHospital.distance_km !== null && (
                <div className="info-row">
                  <span className="info-label">{isTa ? "இருப்பிட தூரம்:" : "Proximity Distance:"}</span>
                  <span className="info-val text-teal font-bold">{selectedHospital.distance_km} km away</span>
                </div>
              )}

              <div className="info-row">
                <span className="info-label">{isTa ? "அவசர பிரிவு:" : "Emergency ED:"}</span>
                <span className="info-val text-success">
                  <CheckCircle size={14} weight="fill" />
                  <span>{isTa ? "24x7 தயார் நிலை" : "24/7 Active Admission"}</span>
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">{isTa ? "நேரடி தொலைபேசி எண்:" : "Emergency Helpline:"}</span>
                <a href={`tel:${selectedHospital.contact_number}`} className="phone-link">
                  <PhoneCall size={14} weight="bold" />
                  <span>{selectedHospital.contact_number}</span>
                </a>
              </div>

              <div className="info-row">
                <span className="info-label">{isTa ? "மதிப்பிடப்பட்ட காத்திருப்பு நேரம்:" : "Est. Wait Time:"}</span>
                <span className="info-val">~{selectedHospital.wait_time_minutes} minutes</span>
              </div>
            </div>

            {/* Available Facilities & Departments */}
            {selectedHospital.facilities && selectedHospital.facilities.length > 0 && (
              <div className="facilities-section">
                <h4 className="facilities-title">{isTa ? "கிடைக்கும் சிறப்பு வசதிகள்" : "Available Hospital Facilities"}</h4>
                <div className="facilities-grid">
                  {selectedHospital.facilities.map((fac, idx) => (
                    <div key={idx} className="facility-tag-card">
                      <CheckCircle size={13} weight="bold" className="tag-check" />
                      <span>{fac}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions: Open in OSM & Book Slot */}
            <div className="panel-actions-group">
              <a
                href={`https://www.openstreetmap.org/?mlat=${selectedHospital.latitude}&mlon=${selectedHospital.longitude}#map=16/${selectedHospital.latitude}/${selectedHospital.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="open-osm-btn"
                title="View on OpenStreetMap"
              >
                <ArrowSquareOut size={16} weight="bold" />
                <span>{isTa ? "OpenStreetMap தளத்தில் பார்க்க" : "View on OpenStreetMap"}</span>
              </a>

              {onSelectHospitalForBooking && (
                <button
                  type="button"
                  className="btn-book-slot-primary"
                  onClick={() => onSelectHospitalForBooking(selectedHospital)}
                >
                  <HospitalIcon size={16} weight="bold" />
                  <span>{isTa ? "இங்கு மருத்துவ சந்திப்பு பதிவு செய்க" : "Book Doctor Appointment Here"}</span>
                </button>
              )}
            </div>

            {/* Synthetic Data Disclaimer (Mandatory) */}
            <div className="simulated-disclaimer">
              <WarningCircle size={16} weight="fill" className="disclaimer-icon" />
              <span>
                {isTa
                  ? "கவனத்திற்கு: படுக்கை இருப்பு மற்றும் காத்திருப்பு நேரம் மாதிரி டெமோ தரவாகும் (Synthetic Dataset). அவசர சூழல்களில் மருத்துவமனை அவசர பிரிவை நேரடியாக தொடர்பு கொள்ளவும்."
                  : "Notice: Real-time bed and ICU availability telemetry is simulated for the hackathon demonstration. Always contact the hospital emergency desk directly prior to transport."}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
