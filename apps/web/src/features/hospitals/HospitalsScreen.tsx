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
  ShieldCheck,
  Lightning,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import type { Hospital, CapacityDataSourceType } from "../../types/backend";
import {
  getHospitals,
  simulateHospitalCrowd,
  simulateBatchCapacityUpdate,
} from "../../services/api";
import "./HospitalsScreen.css";

interface HospitalsScreenProps {
  language: string;
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
  { id: "coimbatore", name: "Coimbatore", nameTa: "கோயம்புத்தூர்", lat: 11.0218, lon: 76.9498 },
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
    emergency_status: "24/7 Active Admission",
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
    last_updated: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    is_simulated: true,
    data_source: "Tamil Nadu 108 Emergency Network Telemetry (Simulated)",
    data_source_type: "simulated",
  },
  {
    id: "hosp-2",
    name: "Rajiv Gandhi Government General Hospital (RGGGH)",
    address: "EVR Periyar Salai, Park Town, Chennai, Tamil Nadu 600003",
    latitude: 13.0827,
    longitude: 80.2785,
    contact_number: "+91-44-2530-5000",
    emergency_available: true,
    emergency_status: "High Influx - Trauma & Resuscitation Priority",
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
    last_updated: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    is_simulated: true,
    data_source: "Government Hospital Triage Desk (Simulated)",
    data_source_type: "simulated",
  },
  {
    id: "hosp-3",
    name: "MIOT International",
    address: "4/112 Mount Poonamallee Road, Manapakkam, Chennai, Tamil Nadu 600089",
    latitude: 13.0182,
    longitude: 80.1834,
    contact_number: "+91-44-4200-2288",
    emergency_available: true,
    emergency_status: "24/7 Active Admission",
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
    last_updated: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    is_simulated: false,
    data_source: "Verified Hospital Partner Telemetry API",
    data_source_type: "verified",
  },
  {
    id: "hosp-4",
    name: "Fortis Malar Hospital",
    address: "52 1st Main Rd, Gandhi Nagar, Adyar, Chennai, Tamil Nadu 600020",
    latitude: 13.0067,
    longitude: 80.2571,
    contact_number: "+91-44-4289-2222",
    emergency_available: true,
    emergency_status: "Admissions Open - Capacity Telemetry Stale",
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
    last_updated: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4h ago (Outdated)
    is_simulated: true,
    data_source: "State Trauma Registry Feed (>2h Stale)",
    data_source_type: "outdated",
  },
  {
    id: "hosp-5",
    name: "Kauvery Hospital (Alwarpet)",
    address: "199 Luz Church Road, Alwarpet, Chennai, Tamil Nadu 600004",
    latitude: 13.0366,
    longitude: 80.2543,
    contact_number: "+91-44-4000-6000",
    emergency_available: true,
    emergency_status: "24/7 Active Admission",
    bed_capacity: 200,
    beds_available: 28,
    icu_capacity: 35,
    icu_available: 6,
    status: "normal",
    wait_time_minutes: 10,
    facilities: [
      "24/7 Acute Care Emergency",
      "Neuro ICU",
      "Cardiac Emergency",
      "Emergency Ambulance Dispatch",
      "Day Care Surgery",
    ],
    last_updated: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    is_simulated: true,
    data_source: "Hospital Emergency Desk Telemetry (Simulated)",
    data_source_type: "simulated",
  },
  {
    id: "hosp-6",
    name: "PSG Hospitals (Coimbatore)",
    address: "Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu 641004",
    latitude: 11.0267,
    longitude: 77.0028,
    contact_number: "+91-422-257-0170",
    emergency_available: true,
    emergency_status: "24/7 Active Admission",
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
    last_updated: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    is_simulated: true,
    data_source: "Coimbatore Regional Medical Registry (Simulated)",
    data_source_type: "simulated",
  },
  {
    id: "hosp-7",
    name: "Meenakshi Mission Hospital & Research Centre (Madurai)",
    address: "Melur Main Road, Lake Area, Madurai, Tamil Nadu 625107",
    latitude: 9.9458,
    longitude: 78.1528,
    contact_number: "+91-452-258-8741",
    emergency_available: true,
    emergency_status: "Critical Volume - ED Bed Shortage / Diversion Risk",
    bed_capacity: 800,
    beds_available: 4,
    icu_capacity: 90,
    icu_available: 1,
    status: "critical",
    wait_time_minutes: 65,
    facilities: [
      "24/7 Emergency Department",
      "Cardiovascular Cath Lab",
      "Surgical Oncology",
      "Neuro Trauma ICU",
      "Mobile ICU Ambulances",
    ],
    last_updated: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    is_simulated: true,
    data_source: "District Health Surveillance Feed (Simulated)",
    data_source_type: "simulated",
  },
  {
    id: "hosp-8",
    name: "Apollo Speciality Hospital (Trichy)",
    address: "Trichy - Melur Road, Old Palpannai, Tiruchirappalli, Tamil Nadu 620005",
    latitude: 10.8122,
    longitude: 78.7047,
    contact_number: "+91-431-407-7777",
    emergency_available: true,
    emergency_status: "24/7 Active Admission",
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
    last_updated: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    is_simulated: true,
    data_source: "Central TN Healthcare Feed (Simulated)",
    data_source_type: "simulated",
  },
  {
    id: "hosp-9",
    name: "Suburban Community Health & Urgent Care Center",
    address: "Old Thanjavur Road, Kattur, Tiruchirappalli, Tamil Nadu 620019",
    latitude: 10.7954,
    longitude: 78.7321,
    contact_number: "+91-431-255-1234",
    emergency_available: false,
    emergency_status: "Telemetry Offline - Intake Call Required",
    bed_capacity: null,
    beds_available: null,
    icu_capacity: null,
    icu_available: null,
    status: "unknown",
    wait_time_minutes: null,
    facilities: [
      "Outpatient Consultations",
      "Minor Injury Treatment",
      "Basic Pharmacy",
    ],
    last_updated: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    is_simulated: true,
    data_source: "Offline / Telemetry Unavailable",
    data_source_type: "unavailable",
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

function getFreshnessInfo(lastUpdated: string, isTa: boolean): { label: string; isStale: boolean } {
  try {
    const updated = new Date(lastUpdated).getTime();
    const diffMins = Math.floor((Date.now() - updated) / (1000 * 60));

    if (isNaN(diffMins) || diffMins < 0) {
      return { label: isTa ? "சமீபத்தில்" : "Recently", isStale: false };
    }
    if (diffMins < 2) {
      return { label: isTa ? "இப்போதுதான்" : "Just now", isStale: false };
    }
    if (diffMins < 60) {
      return {
        label: isTa ? `${diffMins} நிமிடங்களுக்கு முன்` : `${diffMins}m ago`,
        isStale: false,
      };
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 2) {
      return {
        label: isTa ? "1 மணி நேரத்திற்கு முன்" : "1h ago",
        isStale: false,
      };
    }
    return {
      label: isTa ? `${diffHours} மணி நேரத்திற்கு முன் (பழையது)` : `${diffHours}h ago (Stale)`,
      isStale: true,
    };
  } catch {
    return { label: isTa ? "சமீபத்தில்" : "Recently", isStale: false };
  }
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("all");
  const [emergencyOnly, setEmergencyOnly] = useState(false);

  // Simulation Feedback & Toast
  const [isSimulating, setIsSimulating] = useState(false);
  const [simToast, setSimToast] = useState<string | null>(null);

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
        status: statusFilter !== "all" ? statusFilter : undefined,
        data_source_type: sourceTypeFilter !== "all" ? sourceTypeFilter : undefined,
        lat: loc?.lat ?? userLocation?.lat,
        lon: loc?.lon ?? userLocation?.lon,
      });

      if (data && data.length > 0) {
        setHospitals(data);
        if (!selectedHospital || !data.some((h) => h.id === selectedHospital.id)) {
          setSelectedHospital(data[0]);
        }
      } else {
        // Fallback filter
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
        if (statusFilter !== "all") {
          filtered = filtered.filter((h) => h.status.toLowerCase() === statusFilter.toLowerCase());
        }
        if (sourceTypeFilter !== "all") {
          filtered = filtered.filter((h) => h.data_source_type?.toLowerCase() === sourceTypeFilter.toLowerCase());
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
      if (statusFilter !== "all") {
        filtered = filtered.filter((h) => h.status.toLowerCase() === statusFilter.toLowerCase());
      }
      if (sourceTypeFilter !== "all") {
        filtered = filtered.filter((h) => h.data_source_type?.toLowerCase() === sourceTypeFilter.toLowerCase());
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
  }, [searchQuery, emergencyOnly, facilityFilter, statusFilter, sourceTypeFilter, userLocation?.lat, userLocation?.lon, selectedHospital]);

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

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([latitude, longitude], 13, { duration: 1 });
        }
        loadHospitals(loc);
      },
      (error) => {
        if (error.code === 1) {
          setLocationStatus("denied");
          setLocationMessage(
            isTa
              ? "இருப்பிட அனுமதி மறுக்கப்பட்டது. துல்லியமான தூரத்திற்கு கீழே உள்ள நகரங்களில் ஒன்றைத் தேர்ந்தெடுக்கலாம்."
              : "Location access was denied. You can select your city or use manual search below."
          );
        } else {
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

  // Interactive Live Surge Simulation Trigger
  const handleTriggerCrowdSurge = async () => {
    if (!selectedHospital) return;
    setIsSimulating(true);

    try {
      const updated = await simulateHospitalCrowd(selectedHospital.id);
      setSelectedHospital(updated);
      setHospitals((prev) =>
        prev.map((h) => (h.id === updated.id ? { ...h, ...updated } : h))
      );
      setSimToast(
        isTa
          ? `மாதிரி நிலவர மாற்றம்: ${updated.name} -> ${updated.status.toUpperCase()} (காத்திருப்பு: ~${updated.wait_time_minutes}m)`
          : `Live crowd surge simulated: ${updated.name} -> ${updated.status.toUpperCase()} (Wait: ~${updated.wait_time_minutes}m)`
      );
    } catch {
      // Local client-side simulation cycle if backend offline
      const current = selectedHospital.status;
      const bedCap = selectedHospital.bed_capacity || 100;
      const nextStatus = current === "normal" ? "busy" : current === "busy" ? "critical" : "normal";
      const nextBeds = nextStatus === "busy" ? Math.max(3, Math.round(bedCap * 0.12)) : nextStatus === "critical" ? 2 : Math.round(bedCap * 0.35);
      const nextWait = nextStatus === "busy" ? 35 : nextStatus === "critical" ? 65 : 15;

      const updated: Hospital = {
        ...selectedHospital,
        status: nextStatus,
        beds_available: nextBeds,
        wait_time_minutes: nextWait,
        emergency_status: nextStatus === "critical" ? "Critical Volume - ED Bed Shortage" : nextStatus === "busy" ? "High Volume - Delayed Admission" : "24/7 Active Admission",
        last_updated: new Date().toISOString(),
        data_source: "Demo Live Surge Trigger (Client)",
      };
      setSelectedHospital(updated);
      setHospitals((prev) =>
        prev.map((h) => (h.id === updated.id ? updated : h))
      );
      setSimToast(
        isTa
          ? `மாதிரி மாற்றம்: ${updated.status.toUpperCase()} (காத்திருப்பு: ~${updated.wait_time_minutes}m)`
          : `Live crowd surge simulated: ${updated.status.toUpperCase()} (Wait: ~${updated.wait_time_minutes}m)`
      );
    } finally {
      setIsSimulating(false);
      setTimeout(() => setSimToast(null), 4000);
    }
  };

  // Trigger batch telemetric tick across all hospitals
  const handleTriggerBatchUpdate = async () => {
    setIsSimulating(true);
    try {
      await simulateBatchCapacityUpdate();
      await loadHospitals();
      setSimToast(
        isTa
          ? "அனைத்து மருத்துவமனைகளின் கொள்ளளவு தரவு வெற்றிகரமாக புதுப்பிக்கப்பட்டது!"
          : "Capacity telemetry stream refreshed across all hospital nodes!"
      );
    } catch {
      await loadHospitals();
    } finally {
      setIsSimulating(false);
      setTimeout(() => setSimToast(null), 3000);
    }
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

  // Update Markers on hospitals or selectedHospital change
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
      const isUnknown = hosp.status === "unknown";
      const statusColor = isCritical ? "#ef4444" : isBusy ? "#d97706" : isUnknown ? "#64748b" : "#0d9488";

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
          ${hosp.status.toUpperCase()} • ${hosp.emergency_available ? "24/7 EMERGENCY" : "DAYTIME / CALL"}
        </span>
        <p style="margin: 0 0 6px; font-size: 11px; color: #64748b; line-height: 1.3;">${hosp.address}</p>
        <div style="font-size: 11px; font-weight: 600; color: #0d9488;">
          ${
            hosp.beds_available != null
              ? `Beds: ${hosp.beds_available}/${hosp.bed_capacity} &bull; ICU: ${hosp.icu_available}/${hosp.icu_capacity}`
              : `<span style="color:#94a3b8">Capacity telemetry unavailable</span>`
          }
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

  // Render DataSource Badge Helper
  const renderSourceBadge = (type?: CapacityDataSourceType) => {
    switch (type) {
      case "verified":
        return (
          <span className="source-badge verified" title="Verified Hospital Partner Telemetry API">
            <ShieldCheck size={13} weight="bold" />
            <span>{isTa ? "சரிபார்க்கப்பட்டது" : "Verified"}</span>
          </span>
        );
      case "outdated":
        return (
          <span className="source-badge outdated" title="Capacity telemetry is >2 hours stale">
            <Clock size={13} weight="bold" />
            <span>{isTa ? "காலாவதியானது (>2h)" : "Outdated (>2h)"}</span>
          </span>
        );
      case "unavailable":
        return (
          <span className="source-badge unavailable" title="Capacity telemetry is offline / missing">
            <WarningCircle size={13} weight="bold" />
            <span>{isTa ? "கிடைக்கவில்லை" : "Unavailable"}</span>
          </span>
        );
      case "simulated":
      default:
        return (
          <span className="source-badge simulated" title="Synthetic hospital capacity demo data">
            <Flask size={13} weight="bold" />
            <span>{isTa ? "மாதிரி தரவு" : "Simulated"}</span>
          </span>
        );
    }
  };

  // Occupancy rate calculation
  const occupancyPercent =
    selectedHospital.bed_capacity && selectedHospital.beds_available != null
      ? Math.round(
          ((selectedHospital.bed_capacity - selectedHospital.beds_available) /
            selectedHospital.bed_capacity) *
            100
        )
      : null;

  const freshness = getFreshnessInfo(selectedHospital.last_updated, isTa);
  const isDataStale = freshness.isStale || selectedHospital.data_source_type === "outdated";
  const isDataUnavailable =
    selectedHospital.data_source_type === "unavailable" ||
    selectedHospital.beds_available == null;

  return (
    <div className="hospitals-screen" lang={language}>
      {/* Simulation Feedback Toast */}
      {simToast && (
        <div className="sim-toast-banner">
          <Lightning size={18} weight="fill" className="toast-icon" />
          <span>{simToast}</span>
        </div>
      )}

      {/* Top Header Banner */}
      <div className="hospitals-header-banner">
        <div>
          <div className="badge-pill">
            <HospitalIcon size={16} weight="fill" />
            <span>{isTa ? "மருத்துவமனை வழிகாட்டி & கூட்ட நெரிசல் கண்காணிப்பு" : "Hospital Finder & Crowd Monitoring"}</span>
          </div>
          <h1 className="hospitals-title">
            {isTa ? "அருகிலுள்ள மருத்துவமனைகள் & கொள்ளளவு நிலவரம்" : "Hospital Crowd & Capacity Telemetry"}
          </h1>
          <p className="hospitals-sub">
            {isTa
              ? "அவசர பிரிவு தயார்நிலை, படுக்கை இருப்பு, ஐசியூ கொள்ளளவு மற்றும் காத்திருப்பு நேரத்தை வெளிப்படையான தரவு மூலங்களுடன் காண்க."
              : "Real-time emergency department crowd status, bed telemetry, and wait times with transparent data sources and freshness tags."}
          </p>
        </div>

        <div className="banner-top-actions">
          <button
            type="button"
            className="btn-refresh-stream"
            onClick={handleTriggerBatchUpdate}
            disabled={isSimulating}
            title={isTa ? "அனைத்து மருத்துவமனை தரவையும் மீண்டும் புதுப்பிக்கவும்" : "Trigger live capacity telemetry refresh across all hospitals"}
          >
            <ArrowsClockwise size={14} weight="bold" className={isSimulating ? "spinning" : ""} />
            <span>{isTa ? "தரவு புதுப்பிப்பு" : "Refresh Telemetry"}</span>
          </button>
          <div className="synthetic-badge-pill" title="Simulated Hospital Capacity Dataset for Hackathon">
            <Flask size={14} weight="bold" />
            <span>{isTa ? "மாதிரி தரவுத்தளம் (Demo)" : "Synthetic Dataset"}</span>
          </div>
        </div>
      </div>

      {/* Mandatory Urgent Medical Emergency Guidance Banner */}
      <div className="urgent-guidance-banner">
        <div className="urgent-guidance-left">
          <FirstAid size={26} weight="fill" className="urgent-icon" />
          <div>
            <strong className="urgent-title">
              {isTa ? "அவசர மருத்துவ வழிகாட்டுதல்:" : "Urgent Emergency Notice: "}
            </strong>
            <span className="urgent-text">
              {isTa
                ? "மாரடைப்பு, கடுமையான மூச்சுத்திணறல், பக்கவாதம் அல்லது அதிக இரத்தப்போக்கு போன்ற ஆபத்தான தருணங்களில் கொள்ளளவு நிலவரத்திற்கு காத்திருக்காமல் உடனடியாக 108 அழைக்கவும் அல்லது அருகிலுள்ள அவசர சிகிச்சைப் பிரிவிற்கு செல்லவும்."
                : "In critical life-threatening emergencies (acute chest pain, stroke, severe trauma, respiratory distress), DO NOT delay care waiting for capacity updates. Call 108 or proceed immediately to the closest emergency room."}
            </span>
          </div>
        </div>
        <div className="emergency-quick-actions">
          {selectedHospital && (
            <a href={`tel:${selectedHospital.contact_number}`} className="btn-call-ed">
              <PhoneCall size={14} weight="bold" />
              <span>{isTa ? "தேர்ந்தெடுத்த ED அழைக்க" : `Call ${selectedHospital.name.split(" ")[0]} ED`}</span>
            </a>
          )}
          <a href="tel:108" className="btn-call-108">
            <PhoneCall size={16} weight="bold" />
            <span>{isTa ? "அழை: 108" : "Call 108"}</span>
          </a>
        </div>
      </div>

      {/* Search, GPS, Region Presets & Capacity Filters */}
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
                <span>{isTa ? "மீட்டமை" : "Reset GPS"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Row 1: Status & Telemetry Filters */}
        <div className="filter-tags-row">
          <span className="filter-label">
            <Funnel size={14} />
            <span>{isTa ? "கூட்ட நிலை:" : "Crowd Status:"}</span>
          </span>
          <button
            type="button"
            className={`filter-btn ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            {isTa ? "அனைத்து நிலைகள்" : "All Statuses"}
          </button>
          <button
            type="button"
            className={`filter-btn ${statusFilter === "normal" ? "active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "normal" ? "all" : "normal")}
          >
            <span className="status-dot dot-normal" />
            <span>{isTa ? "சாதாரண நிலை" : "Normal Capacity"}</span>
          </button>
          <button
            type="button"
            className={`filter-btn ${statusFilter === "busy" ? "active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "busy" ? "all" : "busy")}
          >
            <span className="status-dot dot-busy" />
            <span>{isTa ? "அதிக நெரிசல்" : "High Volume"}</span>
          </button>
          <button
            type="button"
            className={`filter-btn ${statusFilter === "critical" ? "active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "critical" ? "all" : "critical")}
          >
            <span className="status-dot dot-critical" />
            <span>{isTa ? "முழு கொள்ளளவு" : "Critical Shortage"}</span>
          </button>

          <span className="filter-divider">|</span>

          <span className="filter-label">
            <span>{isTa ? "மூலம்:" : "Source:"}</span>
          </span>
          <button
            type="button"
            className={`filter-btn ${sourceTypeFilter === "all" ? "active" : ""}`}
            onClick={() => setSourceTypeFilter("all")}
          >
            {isTa ? "அனைத்து மூலங்கள்" : "All Sources"}
          </button>
          <button
            type="button"
            className={`filter-btn ${sourceTypeFilter === "verified" ? "active" : ""}`}
            onClick={() => setSourceTypeFilter(sourceTypeFilter === "verified" ? "all" : "verified")}
          >
            <ShieldCheck size={13} weight="bold" />
            <span>{isTa ? "சரிபார்க்கப்பட்டது" : "Verified Only"}</span>
          </button>
          <button
            type="button"
            className={`filter-btn ${sourceTypeFilter === "outdated" ? "active" : ""}`}
            onClick={() => setSourceTypeFilter(sourceTypeFilter === "outdated" ? "all" : "outdated")}
          >
            <Clock size={13} weight="bold" />
            <span>{isTa ? "காலாவதியானது" : "Outdated (>2h)"}</span>
          </button>
        </div>

        {/* Filter Controls Row 2: Clinical Facilities */}
        <div className="filter-tags-row secondary-filters">
          <span className="filter-label">
            <span>{isTa ? "வசதிகள்:" : "Clinical Facilities:"}</span>
          </span>
          <button
            type="button"
            className={`filter-btn ${facilityFilter === "all" && !emergencyOnly ? "active" : ""}`}
            onClick={() => {
              setFacilityFilter("all");
              setEmergencyOnly(false);
            }}
          >
            {isTa ? "அனைத்து வசதிகள்" : "All Facilities"}
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
            <span>{isTa ? "கார்டியாக் கேத் லேப்" : "Cardiology Cath Lab"}</span>
          </button>
          <button
            type="button"
            className={`filter-btn ${facilityFilter === "Trauma" ? "active" : ""}`}
            onClick={() => setFacilityFilter(facilityFilter === "Trauma" ? "all" : "Trauma")}
          >
            <span>{isTa ? "டிராமா மையம்" : "Level 1 Trauma"}</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout: Hospital Cards & Interactive Map + Details Panel */}
      <div className="hospitals-layout-grid">
        {/* Left Column: Hospital List Cards */}
        <div className="hospitals-list-column">
          <div className="list-column-header">
            <h2 className="column-heading">
              {isTa ? "கிடைக்கும் மருத்துவ மையங்கள்" : "Monitored Medical Centers"}
            </h2>
            <span className="results-count">
              {hospitals.length} {isTa ? "மையங்கள் கண்டறியப்பட்டன" : "facilities reporting"}
            </span>
          </div>

          {loading ? (
            <div className="loading-state-card">
              <div className="spinner-border" />
              <span>{isTa ? "கொள்ளளவு தரவுகள் புதுப்பிக்கப்படுகின்றன..." : "Synchronizing hospital capacity telemetry..."}</span>
            </div>
          ) : hospitals.length === 0 ? (
            <div className="empty-hospitals-card">
              <HospitalIcon size={40} className="empty-icon" />
              <h3>{isTa ? "மருத்துவமனைகள் காணப்படவில்லை" : "No hospitals match your search criteria"}</h3>
              <p>
                {isTa
                  ? "வேறு பெயர் அல்லது வடிகட்டிகளை மீட்டமைக்கவும்."
                  : "Try loosening your search terms or clearing the selected filters."}
              </p>
              <button
                type="button"
                className="btn-reset-filters"
                onClick={() => {
                  setSearchQuery("");
                  setFacilityFilter("all");
                  setStatusFilter("all");
                  setSourceTypeFilter("all");
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
                const isCritical = hosp.status === "critical";
                const cardFreshness = getFreshnessInfo(hosp.last_updated, isTa);
                const hasCapacityData = hosp.beds_available != null && hosp.bed_capacity != null;

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

                      <div className="top-pills-stack">
                        <span className={`status-pill ${hosp.status}`}>
                          {isNormal
                            ? isTa ? "சாதாரண நிலை" : "Normal Capacity"
                            : isBusy
                            ? isTa ? "அதிக நெரிசல்" : "High Volume"
                            : isCritical
                            ? isTa ? "முழு கொள்ளளவு" : "Critical Shortage"
                            : isTa ? "தெரியவில்லை" : "Status Unknown"}
                        </span>
                        {renderSourceBadge(hosp.data_source_type)}
                      </div>
                    </div>

                    {/* Emergency Department Operational Status */}
                    {hosp.emergency_status && (
                      <div className={`ed-status-bar ${hosp.status}`}>
                        <FirstAid size={13} weight="bold" />
                        <span>{hosp.emergency_status}</span>
                      </div>
                    )}

                    {/* Capacity Telemetry Numbers (Only Render When Data Exists) */}
                    <div className="hosp-capacity-stats">
                      <div className="stat-box">
                        <span className="stat-label">{isTa ? "பொது படுக்கைகள்" : "General Beds"}</span>
                        <span className="stat-val">
                          {hasCapacityData
                            ? `${hosp.beds_available} / ${hosp.bed_capacity}`
                            : <span className="text-muted">— / —</span>}
                        </span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">{isTa ? "ஐசியூ படுக்கைகள்" : "ICU Beds"}</span>
                        <span className="stat-val text-teal">
                          {hosp.icu_available != null && hosp.icu_capacity != null
                            ? `${hosp.icu_available} / ${hosp.icu_capacity}`
                            : <span className="text-muted">— / —</span>}
                        </span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">{isTa ? "காத்திருப்பு" : "Est. Wait"}</span>
                        <span className="stat-val">
                          {hosp.wait_time_minutes != null
                            ? `~${hosp.wait_time_minutes}m`
                            : <span className="text-muted">—</span>}
                        </span>
                      </div>
                    </div>

                    {/* Warning if Stale or Unavailable */}
                    {hosp.data_source_type === "unavailable" && (
                      <div className="card-alert-strip warning">
                        <WarningCircle size={13} weight="fill" />
                        <span>{isTa ? "கொள்ளளவு தரவு கிடைக்கவில்லை — மருத்துவமனையை நேரடியாக தொடர்பு கொள்ளவும்." : "Capacity telemetry offline. Confirm availability directly."}</span>
                      </div>
                    )}
                    {cardFreshness.isStale && (
                      <div className="card-alert-strip stale">
                        <Clock size={13} weight="fill" />
                        <span>{isTa ? "தரவு 2 மணி நேரத்திற்கும் மேலாக பழையது." : "Capacity data is over 2 hours stale."}</span>
                      </div>
                    )}

                    <div className="hosp-card-footer">
                      <div className="footer-meta">
                        <span className="last-updated" title={new Date(hosp.last_updated).toLocaleString()}>
                          <Clock size={12} />
                          <span>{cardFreshness.label}</span>
                        </span>
                        {hosp.data_source && (
                          <span className="footer-source-name" title={hosp.data_source}>
                            • {hosp.data_source.split("(")[0]}
                          </span>
                        )}
                      </div>

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
                            <span>{isTa ? "சந்திப்பு" : "Book Slot"}</span>
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

        {/* Right Column: Leaflet Interactive Map & Selected Hospital Detailed Telemetry Panel */}
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
              <div className="panel-header-text">
                <div className="panel-header-title-row">
                  <h3 className="panel-title">{selectedHospital.name}</h3>
                  {renderSourceBadge(selectedHospital.data_source_type)}
                </div>
                <span className="panel-subtitle">
                  {selectedHospital.emergency_status ||
                    (selectedHospital.emergency_available
                      ? isTa ? "24 மணி நேர அவசர சிகிச்சை தயார்நிலை" : "24/7 Active Emergency Department"
                      : isTa ? "பகல்நேர மருத்துவ மையம்" : "Outpatient Medical Facility")}
                </span>
              </div>
            </div>

            {/* Live Crowd & Capacity Telemetry Breakdown */}
            <div className="telemetry-breakdown-card">
              <div className="telemetry-header">
                <span className="telemetry-title">{isTa ? "நேரடி கொள்ளளவு நிலவரம்" : "Live Capacity Telemetry"}</span>
                <span className={`status-pill ${selectedHospital.status}`}>
                  {selectedHospital.status.toUpperCase()}
                </span>
              </div>

              {/* Occupancy Progress Bar (Only when data exists) */}
              {occupancyPercent !== null ? (
                <div className="occupancy-progress-container">
                  <div className="occupancy-labels">
                    <span className="occupancy-text">
                      {isTa ? "படுக்கை ஆக்கிரமிப்பு விகிதம்" : "Bed Occupancy Rate"}
                    </span>
                    <span className="occupancy-val">{occupancyPercent}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`progress-fill ${
                        occupancyPercent > 90 ? "critical" : occupancyPercent > 75 ? "busy" : "normal"
                      }`}
                      style={{ width: `${Math.min(100, occupancyPercent)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="telemetry-unavailable-banner">
                  <WarningCircle size={15} weight="fill" />
                  <span>{isTa ? "இந்த மையத்திற்கான நேரடி கொள்ளளவு தகவல் கிடைக்கவில்லை." : "Real-time occupancy telemetry is not available for this center."}</span>
                </div>
              )}

              {/* Detailed Numbers Grid */}
              <div className="telemetry-grid">
                <div className="tele-item">
                  <span className="tele-label">{isTa ? "கிடைக்கும் படுக்கைகள்" : "Available Beds"}</span>
                  <span className="tele-val">
                    {selectedHospital.beds_available != null
                      ? `${selectedHospital.beds_available} of ${selectedHospital.bed_capacity}`
                      : "—"}
                  </span>
                </div>
                <div className="tele-item">
                  <span className="tele-label">{isTa ? "கிடைக்கும் ஐசியூ" : "Available ICU"}</span>
                  <span className="tele-val text-teal">
                    {selectedHospital.icu_available != null
                      ? `${selectedHospital.icu_available} of ${selectedHospital.icu_capacity}`
                      : "—"}
                  </span>
                </div>
                <div className="tele-item">
                  <span className="tele-label">{isTa ? "மதிப்பிடப்பட்ட காத்திருப்பு" : "Est. Wait Time"}</span>
                  <span className="tele-val">
                    {selectedHospital.wait_time_minutes != null
                      ? `~${selectedHospital.wait_time_minutes} mins`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Data Source & Freshness Transparency Box */}
            <div className="source-transparency-box">
              <h4 className="transparency-title">{isTa ? "தரவு மூல வெளிப்படைத்தன்மை" : "Data Source & Freshness"}</h4>
              <div className="transparency-rows">
                <div className="trans-row">
                  <span className="trans-label">{isTa ? "தரவு மூலம்:" : "Data Source:"}</span>
                  <span className="trans-val">{selectedHospital.data_source || "Unspecified"}</span>
                </div>
                <div className="trans-row">
                  <span className="trans-label">{isTa ? "நம்பகத்தன்மை வகை:" : "Trust Category:"}</span>
                  <span className="trans-val">{renderSourceBadge(selectedHospital.data_source_type)}</span>
                </div>
                <div className="trans-row">
                  <span className="trans-label">{isTa ? "கடைசியாக புதுப்பிக்கப்பட்டது:" : "Last Updated:"}</span>
                  <span className={`trans-val ${isDataStale ? "text-danger" : ""}`}>
                    {freshness.label} ({new Date(selectedHospital.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </span>
                </div>
              </div>
            </div>

            {/* Contextual Warning Banners */}
            {isDataUnavailable && (
              <div className="warning-banner-box missing">
                <WarningCircle size={16} weight="fill" className="warning-icon" />
                <div>
                  <strong>{isTa ? "கொள்ளளவு தரவு கிடைக்கவில்லை:" : "Capacity Telemetry Offline: "}</strong>
                  <span>{isTa ? "இந்த மையத்தின் படுக்கை இருப்பு விவரங்கள் தானியங்கி முறையில் பெறப்படவில்லை. புறப்படுவதற்கு முன் அவசர பிரிவை அழைக்கவும்." : "Bed availability telemetry is not reported for this center. Always call the intake desk before dispatch."}</span>
                </div>
              </div>
            )}

            {isDataStale && (
              <div className="warning-banner-box stale">
                <Clock size={16} weight="fill" className="warning-icon" />
                <div>
                  <strong>{isTa ? "காலாவதியான தரவு எச்சரிக்கை:" : "Stale Telemetry Notice: "}</strong>
                  <span>{isTa ? "இந்த கொள்ளளவு விவரங்கள் 2 மணி நேரத்திற்கும் முன்பானது. தற்போதைய அவசர அறை நிலவரம் மாறுபட்டிருக்கலாம்." : "Capacity data is over 2 hours old. Active emergency intake may differ significantly."}</span>
                </div>
              </div>
            )}

            {selectedHospital.is_simulated && (
              <div className="warning-banner-box simulated">
                <Flask size={16} weight="fill" className="warning-icon" />
                <div>
                  <strong>{isTa ? "டெமோ மாதிரி தரவு அறிவிப்பு:" : "Hackathon Simulated Dataset: "}</strong>
                  <span>{isTa ? "கொள்ளளவு மற்றும் காத்திருப்பு எண்கள் ஏஎம்டி ஹேக்கத்தான் செயல்விளக்கத்திற்காக உருவாக்கப்பட்ட மாதிரி தரவாகும்." : "Occupancy and wait times are synthetic demonstration figures and do not represent verified live hospital telemetry."}</span>
                </div>
              </div>
            )}

            {/* Key Contact & Navigation Info */}
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
                <span className="info-label">{isTa ? "அவசர பிரிவு தயார்நிலை:" : "ED Admission:"}</span>
                <span className="info-val text-success">
                  <CheckCircle size={14} weight="fill" />
                  <span>{selectedHospital.emergency_available ? (isTa ? "24x7 தயார் நிலை" : "24/7 Active") : (isTa ? "பகல்நேரம் மட்டும்" : "Daytime Only")}</span>
                </span>
              </div>

              <div className="info-row">
                <span className="info-label">{isTa ? "நேரடி தொலைபேசி எண்:" : "Emergency Helpline:"}</span>
                <a href={`tel:${selectedHospital.contact_number}`} className="phone-link">
                  <PhoneCall size={14} weight="bold" />
                  <span>{selectedHospital.contact_number}</span>
                </a>
              </div>
            </div>

            {/* Live Hackathon Demonstration Surge Trigger Button */}
            <div className="demo-surge-trigger-box">
              <button
                type="button"
                className="btn-surge-trigger"
                onClick={handleTriggerCrowdSurge}
                disabled={isSimulating}
              >
                <Lightning size={16} weight="fill" className={isSimulating ? "pulsing" : ""} />
                <span>
                  {isSimulating
                    ? isTa ? "நிலை மாற்றப்படுகிறது..." : "Simulating Surge..."
                    : isTa
                    ? "நேரடி கூட்ட நிலவரத்தை மாற்றி அமை (Demo Trigger)"
                    : `Simulate Live Crowd Surge (${selectedHospital.status.toUpperCase()} -> NEXT)`}
                </span>
              </button>
              <span className="surge-helper-text">
                {isTa
                  ? "ஹேக்கத்தான் நடுவர்களுக்கு: இந்த பொத்தானை அழுத்தி மருத்துவமனை கூட்ட நெரிசல் நிலையை நேரலையில் மாற்றி சோதிக்கவும்."
                  : "For Hackathon Judges: Click to cycle this hospital between Normal, Busy, and Critical surge states."}
              </span>
            </div>

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
          </div>
        </div>
      </div>
    </div>
  );
};
