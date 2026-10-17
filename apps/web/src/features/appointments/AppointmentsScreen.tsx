import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  CalendarCheck,
  Hospital as HospitalIcon,
  Clock,
  CheckCircle,
  XCircle,
  PlusCircle,
  WarningCircle,
  Flask,
  User as UserIcon,
  Stethoscope,
  MagnifyingGlass,
  CalendarBlank,
  CurrencyInr,
  Info,
  ShieldCheck,
  Tag,
  Funnel,
} from "@phosphor-icons/react";
import type {
  Appointment,
  Doctor,
  AppointmentSlot,
  CaregiverConsent,
} from "../../types/backend";
import {
  getDoctors,
  getAppointmentSlots,
  getAppointments,
  bookAppointment,
  cancelAppointment,
  getCaregiverRequests,
  ApiError,
} from "../../services/api";
import { useAuth } from "../auth";
import { StateFeedback } from "../../components/ui/StateFeedback";
import "./AppointmentsScreen.css";

interface AppointmentsScreenProps {
  language: "en" | "ta";
  preselectedHospitalName?: string;
}

// Synthetic fallback doctors if backend is offline
const FALLBACK_DOCTORS: Doctor[] = [
  {
    id: "doc-apollo-cardio",
    hospital_id: "hosp-apollo-greams",
    name: "Dr. K. Senthil Nathan, MD, DM",
    department: "Cardiology",
    qualification: "MD (Gen Med), DM (Cardio), FACC",
    consultation_fee: 900,
    is_available: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "doc-apollo-diab",
    hospital_id: "hosp-apollo-greams",
    name: "Dr. A. Meenakshi Sundaram, MD",
    department: "Diabetology & Endocrinology",
    qualification: "MD, PG Dip Diab (UK)",
    consultation_fee: 750,
    is_available: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "doc-rgggh-neuro",
    hospital_id: "hosp-rgggh-central",
    name: "Dr. P. Vimala Devi, MD, DM",
    department: "Neurology",
    qualification: "MD, DM (Neuro) - Madras Medical College",
    consultation_fee: 100,
    is_available: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "doc-miot-ortho",
    hospital_id: "hosp-miot-manapakkam",
    name: "Dr. R. Vijay Anand, MS, MCh",
    department: "Orthopedics & Joint Replacement",
    qualification: "MS (Ortho), MCh (Ortho, UK)",
    consultation_fee: 850,
    is_available: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "doc-fortis-pulmo",
    hospital_id: "hosp-fortis-vadapalani",
    name: "Dr. S. Karthikeyan, MD, FCCP",
    department: "Pulmonology & Critical Care",
    qualification: "MD (Chest Med), European Diploma Pulmonology",
    consultation_fee: 800,
    is_available: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "doc-kauvery-geriatric",
    hospital_id: "hosp-kauvery-alwarpet",
    name: "Dr. N. Lakshmipathy, MD",
    department: "Geriatric Medicine",
    qualification: "MD (Int Med), PGDGM (Geriatrics)",
    consultation_fee: 700,
    is_available: true,
    created_at: new Date().toISOString(),
  },
];

const DEPARTMENTS = [
  "All",
  "Cardiology",
  "Diabetology & Endocrinology",
  "Neurology",
  "Orthopedics & Joint Replacement",
  "Pulmonology & Critical Care",
  "Geriatric Medicine",
  "General Medicine",
  "Pediatrics",
  "Ophthalmology",
];

export const AppointmentsScreen: React.FC<AppointmentsScreenProps> = ({
  language,
  preselectedHospitalName,
}) => {
  const { user } = useAuth();
  const isTa = language === "ta";
  const isCaregiver = user?.role === "caregiver";

  // Navigation tab inside the screen: 'history' | 'browse'
  const [activeView, setActiveView] = useState<"history" | "browse">("history");

  // State: Appointments History
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "confirmed" | "pending" | "cancelled">("all");

  // State: Doctor Directory & Filters
  const [doctors, setDoctors] = useState<Doctor[]>(FALLBACK_DOCTORS);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [searchQuery, setSearchQuery] = useState(preselectedHospitalName || "");
  const [selectedDepartment, setSelectedDepartment] = useState("All");

  // State: Caregiver Consents for proxy booking
  const [caregiverConsents, setCaregiverConsents] = useState<CaregiverConsent[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");

  const hasAptPermission = useCallback((c?: CaregiverConsent | null): boolean => {
    return Boolean(c?.can_view_appointments || c?.permissions?.can_view_appointments);
  }, []);

  // State: Booking Modal
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  });
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
  const [bookingType, setBookingType] = useState<"confirmed" | "pending">("confirmed");
  const [bookingNotes, setBookingNotes] = useState("");
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingConflictError, setBookingConflictError] = useState<string | null>(null);
  const [bookingSuccessMessage, setBookingSuccessMessage] = useState<string | null>(null);

  // State: Cancellation Modal
  const [cancellationTarget, setCancellationTarget] = useState<Appointment | null>(null);
  const [cancellationReason, setCancellationReason] = useState("Schedule conflict");
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancellationError, setCancellationError] = useState<string | null>(null);

  // 1. Fetch Caregiver Consents if role is caregiver
  useEffect(() => {
    if (!isCaregiver) return;
    async function loadConsents() {
      try {
        const consents = await getCaregiverRequests();
        const approved = consents.filter((c) => c.status === "approved");
        setCaregiverConsents(approved);
        if (approved.length > 0 && !selectedPatientId) {
          setSelectedPatientId(approved[0].patient_id);
        }
      } catch (err) {
        console.warn("Could not load caregiver consents for appointments:", err);
      }
    }
    loadConsents();
  }, [isCaregiver, selectedPatientId]);

  // 2. Fetch Appointments
  const fetchAppointments = useCallback(async () => {
    setIsLoadingAppointments(true);
    try {
      const params: { patient_id?: string } = {};
      if (isCaregiver && selectedPatientId) {
        params.patient_id = selectedPatientId;
      }
      const data = await getAppointments(params);
      setAppointments(data);
    } catch (err) {
      console.warn("Backend appointments fetch error:", err);
      // Fallback synthetic appointments
      setAppointments((prev) =>
        prev.length > 0
          ? prev
          : [
              {
                id: "apt-demo-1",
                patient_id: user?.id || "patient-1",
                hospital_id: "hosp-apollo-greams",
                hospital_name: "Apollo Speciality Hospital (Greams Road)",
                doctor_name: "Dr. K. Senthil Nathan, MD, DM",
                department: "Cardiology",
                scheduled_time: new Date(Date.now() + 86400000 * 2).toISOString(),
                status: "confirmed",
                notes: "Routine quarterly diabetic cardiology check-up.",
                booked_by_role: "patient",
                created_at: new Date().toISOString(),
              },
              {
                id: "apt-demo-2",
                patient_id: user?.id || "patient-1",
                hospital_id: "hosp-rgggh-central",
                hospital_name: "Rajiv Gandhi Government General Hospital (RGGGH)",
                doctor_name: "Dr. P. Vimala Devi, MD, DM",
                department: "Neurology",
                scheduled_time: new Date(Date.now() + 86400000 * 4).toISOString(),
                status: "pending",
                notes: "Evaluation of peripheral neuropathy.",
                booked_by_role: "patient",
                created_at: new Date().toISOString(),
              },
            ]
      );
    } finally {
      setIsLoadingAppointments(false);
    }
  }, [isCaregiver, selectedPatientId, user?.id]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // 3. Fetch Doctors
  const fetchDoctors = useCallback(async () => {
    setIsLoadingDoctors(true);
    try {
      const data = await getDoctors({
        department: selectedDepartment !== "All" ? selectedDepartment : undefined,
        query: searchQuery.trim() || undefined,
      });
      if (data && data.length > 0) {
        setDoctors(data);
      } else {
        // Fallback filter
        const filtered = FALLBACK_DOCTORS.filter((d) => {
          const matchDept = selectedDepartment === "All" || d.department.toLowerCase().includes(selectedDepartment.toLowerCase());
          const matchQuery =
            !searchQuery.trim() ||
            d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            d.department.toLowerCase().includes(searchQuery.toLowerCase());
          return matchDept && matchQuery;
        });
        setDoctors(filtered);
      }
    } catch {
      setDoctors(FALLBACK_DOCTORS);
    } finally {
      setIsLoadingDoctors(false);
    }
  }, [selectedDepartment, searchQuery]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  // 4. Fetch Slots when a Doctor and Date are selected in Modal
  useEffect(() => {
    if (!isBookingModalOpen || !selectedDoctor) return;

    async function loadSlots() {
      setIsLoadingSlots(true);
      setSelectedSlot(null);
      setBookingConflictError(null);
      try {
        const remoteSlots = await getAppointmentSlots({
          doctor_id: selectedDoctor?.id,
          date: selectedDate,
          available_only: false,
        });
        if (remoteSlots && remoteSlots.length > 0) {
          setSlots(remoteSlots);
        } else {
          // Fallback slots for demo if backend not reached
          const times = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
          const demoSlots: AppointmentSlot[] = times.map((t, idx) => ({
            id: `slot-${selectedDoctor?.id}-${selectedDate}-${idx}`,
            doctor_id: selectedDoctor?.id || "doc-1",
            hospital_id: selectedDoctor?.hospital_id || "hosp-1",
            start_time: `${selectedDate}T${t}:00Z`,
            end_time: `${selectedDate}T${t.split(":")[0]}:30:00Z`,
            is_booked: idx === 1, // mock 1 slot already taken
          }));
          setSlots(demoSlots);
        }
      } catch {
        // Fallback slots
        const times = ["09:30", "10:30", "11:30", "14:30", "15:30"];
        setSlots(
          times.map((t, idx) => ({
            id: `slot-fallback-${idx}`,
            doctor_id: selectedDoctor?.id || "doc-1",
            hospital_id: selectedDoctor?.hospital_id || "hosp-1",
            start_time: `${selectedDate}T${t}:00Z`,
            end_time: `${selectedDate}T${t.split(":")[0]}:50:00Z`,
            is_booked: false,
          }))
        );
      } finally {
        setIsLoadingSlots(false);
      }
    }

    loadSlots();
  }, [isBookingModalOpen, selectedDoctor, selectedDate]);

  // Open booking modal for a specific doctor
  const handleOpenBooking = (doc: Doctor) => {
    setSelectedDoctor(doc);
    setBookingConflictError(null);
    setBookingSuccessMessage(null);
    setSelectedSlot(null);
    setIsBookingModalOpen(true);
  };

  // Submit Booking with Double-Booking Prevention & Caregiver Authorization Checks
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor) return;

    if (!selectedSlot) {
      setBookingConflictError(
        isTa
          ? "தயவுசெய்து கிடைக்கக்கூடிய நேர இடைவெளியைத் தேர்ந்தெடுக்கவும்."
          : "Please select an available appointment time slot."
      );
      return;
    }

    // Caregiver permission check
    if (isCaregiver) {
      const activeConsent = caregiverConsents.find((c) => c.patient_id === selectedPatientId);
      if (!activeConsent || !hasAptPermission(activeConsent)) {
        setBookingConflictError(
          isTa
            ? "அனுமதி மறுக்கப்பட்டது: இந்த நோயாளிக்கு சந்திப்புகளை முன்பதிவு செய்ய மருத்துவ அனுமதி வழங்கப்படவில்லை."
            : "Permission Denied: Patient has not granted appointment booking permissions to your caregiver account."
        );
        return;
      }
    }

    setIsSubmittingBooking(true);
    setBookingConflictError(null);

    try {
      const scheduledIso = selectedSlot.start_time;

      const payload = {
        hospital_id: selectedDoctor.hospital_id,
        doctor_id: selectedDoctor.id,
        slot_id: selectedSlot.id.startsWith("slot-fallback") ? undefined : selectedSlot.id,
        doctor_name: selectedDoctor.name,
        department: selectedDoctor.department,
        scheduled_time: scheduledIso,
        status: bookingType,
        notes: bookingNotes.trim() || undefined,
        patient_id: isCaregiver && selectedPatientId ? selectedPatientId : undefined,
      };

      await bookAppointment(payload);

      setBookingSuccessMessage(
        isTa
          ? `சந்திப்பு வெற்றிகரமாக ${bookingType === "confirmed" ? "உறுதி செய்யப்பட்டது" : "கோரப்பட்டது"}!`
          : `Appointment successfully ${bookingType === "confirmed" ? "confirmed" : "requested"}!`
      );

      // Refresh appointments and switch view
      await fetchAppointments();

      setTimeout(() => {
        setIsBookingModalOpen(false);
        setBookingSuccessMessage(null);
        setActiveView("history");
      }, 1500);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setBookingConflictError(
          err.message ||
            (isTa
              ? "முரண்பாடு: இந்த மருத்துவர் அல்லது நேரத்தில் ஏற்கனவே சந்திப்பு பதிவு செய்யப்பட்டுள்ளது. மாற்று நேரத்தைத் தேர்வு செய்யவும்."
              : "Conflict Detected: This doctor or time slot is already booked or overlaps with another appointment (+/- 25 min window).")
        );
      } else if (err instanceof ApiError && err.status === 403) {
        setBookingConflictError(
          err.message ||
            (isTa
              ? "அனுமதி பிழை: சந்திப்பை முன்பதிவு செய்ய உங்களுக்கு போதுமான அனுமதி இல்லை."
              : "Authorization Error: You do not have permission to book this appointment.")
        );
      } else {
        const errorMsg =
          err instanceof Error
            ? err.message
            : isTa
            ? "முன்பதிவு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்."
            : "Failed to book appointment. Please check availability and retry.";
        setBookingConflictError(errorMsg);
      }
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  // Open cancellation modal
  const handleOpenCancel = (apt: Appointment) => {
    setCancellationTarget(apt);
    setCancellationReason("Schedule conflict");
    setCancellationError(null);
  };

  // Confirm cancellation and release slot
  const handleConfirmCancel = async () => {
    if (!cancellationTarget) return;
    setIsCancelling(true);
    setCancellationError(null);

    try {
      await cancelAppointment(cancellationTarget.id, { reason: cancellationReason });
      // Update local state
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === cancellationTarget.id
            ? { ...a, status: "cancelled", cancellation_reason: cancellationReason }
            : a
        )
      );
      setCancellationTarget(null);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isTa
          ? "சந்திப்பை ரத்து செய்ய முடியவில்லை."
          : "Failed to cancel appointment.";
      setCancellationError(msg);
    } finally {
      setIsCancelling(false);
    }
  };

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      if (historyFilter === "all") return true;
      return apt.status === historyFilter;
    });
  }, [appointments, historyFilter]);

  // Selected caregiver patient details
  const activeConsent = caregiverConsents.find((c) => c.patient_id === selectedPatientId);

  return (
    <div className="appointments-screen" lang={language}>
      {/* Banner */}
      <div className="appointments-banner">
        <div>
          <div className="badge-pill">
            <CalendarCheck size={16} weight="fill" />
            <span>{isTa ? "மருத்துவ சந்திப்புகள் & முன்பதிவு" : "Clinical Appointments & Booking"}</span>
          </div>
          <h1 className="appointments-title">
            {isTa ? "மருத்துவர் ஆலோசனைகள் & முன்பதிவு" : "Doctor & Hospital Appointment Booking"}
          </h1>
          <p className="appointments-sub">
            {isTa
              ? "மருத்துவமனை அல்லது மருத்துவரைத் தேர்ந்தெடுத்து, நேர இடைவெளியை உறுதிசெய்து உங்கள் சந்திப்புகளை நிர்வகிக்கவும்."
              : "Search hospital specialists, book available consultation slots with double-booking prevention, and manage clinical history."}
          </p>
        </div>

        <div className="banner-actions">
          <div className="synthetic-badge-pill" title="Double-booking validation with database slot locking">
            <Flask size={14} weight="bold" />
            <span>{isTa ? "மாதிரி முன்பதிவு அமைப்பு" : "Synthetic Booking Engine"}</span>
          </div>

          <div className="view-toggle-btns">
            <button
              type="button"
              className={`toggle-nav-btn ${activeView === "history" ? "active" : ""}`}
              onClick={() => setActiveView("history")}
            >
              <CalendarCheck size={16} weight="bold" />
              <span>{isTa ? "எனது சந்திப்புகள்" : "Appointment History"}</span>
              <span className="count-pill">{appointments.length}</span>
            </button>
            <button
              type="button"
              className={`toggle-nav-btn ${activeView === "browse" ? "active" : ""}`}
              onClick={() => setActiveView("browse")}
            >
              <PlusCircle size={16} weight="bold" />
              <span>{isTa ? "புதிய சந்திப்பு பதிவு" : "Find Doctor & Book"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Caregiver Switcher Banner (if caregiver role) */}
      {isCaregiver && (
        <div className="caregiver-context-strip">
          <div className="context-left">
            <UserIcon size={18} weight="bold" />
            <div>
              <span className="context-label">
                {isTa ? "பராமரிப்பாளர் முறைமை — நோயாளி:" : "Caregiver Portal — Booking for Patient:"}
              </span>
              {caregiverConsents.length > 0 ? (
                <select
                  className="patient-selector-dropdown"
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                >
                  {caregiverConsents.map((c) => (
                    <option key={c.patient_id} value={c.patient_id}>
                      {c.patient_name || c.patient_email || c.patient_id} {hasAptPermission(c) ? "✓ (Authorized)" : "⚠ (No Apt Access)"}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="no-patients-warning">
                  {isTa ? "அனுமதி பெற்ற நோயாளிகள் இல்லை." : "No authorized patients with active consent."}
                </span>
              )}
            </div>
          </div>

          {activeConsent && (
            <div className={`permission-indicator ${hasAptPermission(activeConsent) ? "allowed" : "denied"}`}>
              <ShieldCheck size={16} weight="fill" />
              <span>
                {hasAptPermission(activeConsent)
                  ? (isTa ? "சந்திப்பு அனுமதி வழங்கப்பட்டுள்ளது" : "Appointment Booking Permitted")
                  : (isTa ? "சந்திப்பு அனுமதி இல்லை" : "Appointment Permission Missing")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 1: APPOINTMENT HISTORY */}
      {/* ======================================================== */}
      {activeView === "history" && (
        <div className="appointments-list-section">
          <div className="section-header-bar">
            <div>
              <h2 className="section-title">
                {isTa ? "உங்கள் மருத்துவ சந்திப்புகள்" : "Your Scheduled Appointments"}
              </h2>
              <p className="section-sub">
                {isTa
                  ? "உறுதிசெய்யப்பட்ட, நிலுவையில் உள்ள மற்றும் ரத்து செய்யப்பட்ட சந்திப்பு விவரங்கள்."
                  : "Track upcoming, pending requests, and cancelled clinical consultations."}
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="filter-pill-group">
              <button
                type="button"
                className={`filter-pill ${historyFilter === "all" ? "active" : ""}`}
                onClick={() => setHistoryFilter("all")}
              >
                {isTa ? "அனைத்தும்" : "All"} ({appointments.length})
              </button>
              <button
                type="button"
                className={`filter-pill ${historyFilter === "confirmed" ? "active" : ""}`}
                onClick={() => setHistoryFilter("confirmed")}
              >
                {isTa ? "உறுதியானவை" : "Confirmed"} (
                {appointments.filter((a) => a.status === "confirmed").length})
              </button>
              <button
                type="button"
                className={`filter-pill ${historyFilter === "pending" ? "active" : ""}`}
                onClick={() => setHistoryFilter("pending")}
              >
                {isTa ? "நிலுவையில்" : "Pending"} (
                {appointments.filter((a) => a.status === "pending").length})
              </button>
              <button
                type="button"
                className={`filter-pill ${historyFilter === "cancelled" ? "active" : ""}`}
                onClick={() => setHistoryFilter("cancelled")}
              >
                {isTa ? "ரத்து செய்யப்பட்டவை" : "Cancelled"} (
                {appointments.filter((a) => a.status === "cancelled").length})
              </button>
            </div>
          </div>

          {isLoadingAppointments ? (
            <StateFeedback
              state="loading"
              title={isTa ? "சந்திப்புகள் ஏற்றப்படுகின்றன..." : "Loading appointments..."}
              message={isTa ? "உங்கள் மருத்துவ கால அட்டவணை சரிபார்க்கப்படுகிறது." : "Verifying clinical schedules with PostgreSQL."}
            />
          ) : filteredAppointments.length === 0 ? (
            <StateFeedback
              state="empty"
              title={
                historyFilter === "all"
                  ? isTa
                    ? "சந்திப்புகள் எதுவும் பதிவு செய்யப்படவில்லை"
                    : "No appointments scheduled"
                  : isTa
                  ? `இந்த பிரிவில் (${historyFilter}) சந்திப்புகள் இல்லை`
                  : `No ${historyFilter} appointments found`
              }
              message={
                isTa
                  ? "சிறப்பு மருத்துவர்களைத் தேடி புதிய மருத்துவ ஆலோசனையை பதிவு செய்ய கீழே உள்ள பட்டனை அழுத்தவும்."
                  : "Search verified hospital specialists and schedule an in-person or telemedicine appointment."
              }
              actionLabel={isTa ? "மருத்துவரைத் தேர்ந்தெடு" : "Find Doctor & Book"}
              onAction={() => setActiveView("browse")}
            />
          ) : (
            <div className="appointments-grid">
              {filteredAppointments.map((apt) => {
                const isConfirmed = apt.status === "confirmed";
                const isPending = apt.status === "pending";
                const isCancelled = apt.status === "cancelled";
                const isCompleted = apt.status === "completed";

                return (
                  <div key={apt.id} className={`appointment-card ${apt.status}`}>
                    <div className="card-header">
                      <div>
                        <div className="card-top-tags">
                          <span className="department-tag">{apt.department}</span>
                          {apt.booked_by_role === "caregiver" && (
                            <span className="caregiver-actor-tag">
                              <ShieldCheck size={12} weight="bold" />
                              {isTa ? "பராமரிப்பாளர் பதிவு" : "Booked by Caregiver"}
                            </span>
                          )}
                        </div>
                        <h3 className="doctor-title">{apt.doctor_name}</h3>
                      </div>

                      <div className="status-badge-wrap">
                        {isConfirmed && (
                          <span className="status-badge confirmed" title="Booking confirmed by clinical department">
                            <CheckCircle size={14} weight="fill" />
                            <span>{isTa ? "உறுதியானது" : "Confirmed"}</span>
                          </span>
                        )}
                        {isPending && (
                          <span className="status-badge pending" title="Pending hospital confirmation">
                            <Clock size={14} weight="fill" />
                            <span>{isTa ? "நிலுவையில்" : "Pending Request"}</span>
                          </span>
                        )}
                        {isCancelled && (
                          <span className="status-badge cancelled" title="Appointment cancelled and slot released">
                            <XCircle size={14} weight="fill" />
                            <span>{isTa ? "ரத்து செய்யப்பட்டது" : "Cancelled"}</span>
                          </span>
                        )}
                        {isCompleted && (
                          <span className="status-badge completed">
                            <CheckCircle size={14} weight="fill" />
                            <span>{isTa ? "நிறைவுற்றது" : "Completed"}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="appointment-meta-rows">
                      <div className="meta-row">
                        <HospitalIcon size={16} className="meta-icon" />
                        <span>{apt.hospital_name}</span>
                      </div>
                      <div className="meta-row">
                        <Clock size={16} className="meta-icon" />
                        <span>
                          {new Date(apt.scheduled_time).toLocaleString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>

                    {apt.notes && (
                      <p className="apt-notes">
                        <span className="notes-label">{isTa ? "குறிப்பு: " : "Reason: "}</span>
                        &ldquo;{apt.notes}&rdquo;
                      </p>
                    )}

                    {isCancelled && apt.cancellation_reason && (
                      <div className="cancellation-reason-notice">
                        <Info size={14} weight="fill" />
                        <span>
                          {isTa ? "ரத்து காரணம்: " : "Cancellation Reason: "}
                          {apt.cancellation_reason}
                        </span>
                      </div>
                    )}

                    <div className="card-footer-action">
                      {!isCancelled && !isCompleted && (
                        <button
                          type="button"
                          className="btn-cancel-apt"
                          onClick={() => handleOpenCancel(apt)}
                        >
                          <XCircle size={15} weight="bold" />
                          <span>{isTa ? "சந்திப்பை ரத்து செய்" : "Cancel Appointment"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: SEARCH HOSPITALS / DOCTORS & DIRECTORY */}
      {/* ======================================================== */}
      {activeView === "browse" && (
        <div className="doctor-directory-section">
          <div className="directory-header">
            <div>
              <h2 className="section-title">
                {isTa ? "மருத்துவ நிபுணர்கள் & முன்பதிவு" : "Find Specialists & Book Slot"}
              </h2>
              <p className="section-sub">
                {isTa
                  ? "மருத்துவர் பெயர், மருத்துவப் பிரிவு அல்லது மருத்துவமனையைத் தேடுங்கள்."
                  : "Search doctors by name, specialty, or hospital affiliation. Slots are dynamically locked in PostgreSQL."}
              </p>
            </div>

            <button
              type="button"
              className="back-to-history-btn"
              onClick={() => setActiveView("history")}
            >
              <CalendarCheck size={16} weight="bold" />
              <span>{isTa ? "சந்திப்பு வரலாற்றைக் காண்க" : "View Appointments"}</span>
            </button>
          </div>

          {/* Search bar & Department filter chips */}
          <div className="directory-filters">
            <div className="search-input-wrap">
              <MagnifyingGlass size={18} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder={
                  isTa
                    ? "மருத்துவர், மருத்துவமனை அல்லது சிறப்புப் பிரிவைத் தேடுங்கள்..."
                    : "Search by doctor name, hospital, or department..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery("")}
                >
                  &times;
                </button>
              )}
            </div>

            <div className="department-chips-scroll">
              <Funnel size={15} className="filter-icon" />
              {DEPARTMENTS.map((dept) => (
                <button
                  key={dept}
                  type="button"
                  className={`dept-chip ${selectedDepartment === dept ? "active" : ""}`}
                  onClick={() => setSelectedDepartment(dept)}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>

          {/* Doctors Grid */}
          {isLoadingDoctors ? (
            <StateFeedback
              state="loading"
              title={isTa ? "மருத்துவர்கள் விவரம் பெறப்படுகிறது..." : "Loading specialists..."}
              message={isTa ? "கிடைக்கக்கூடிய மருத்துவ அட்டவணைகள் சரிபார்க்கப்படுகின்றன." : "Querying clinical registry."}
            />
          ) : doctors.length === 0 ? (
            <StateFeedback
              state="empty"
              title={isTa ? "மருத்துவர்கள் காணப்படவில்லை" : "No specialists found"}
              message={
                isTa
                  ? "உங்கள் தேடல் வார்த்தையை மாற்றவும் அல்லது அனைத்து பிரிவுகளையும் தேர்வு செய்யவும்."
                  : "Try clearing your search query or selecting 'All' departments."
              }
              actionLabel={isTa ? "தேடலை மீட்டமைக்க" : "Reset Filters"}
              onAction={() => {
                setSearchQuery("");
                setSelectedDepartment("All");
              }}
            />
          ) : (
            <div className="doctors-grid">
              {doctors.map((doc) => (
                <div key={doc.id} className="doctor-card">
                  <div className="doctor-card-top">
                    <div className="doctor-avatar-circle">
                      <Stethoscope size={24} weight="duotone" />
                    </div>
                    <div className="doctor-info">
                      <h3 className="doctor-name">{doc.name}</h3>
                      <span className="doctor-dept">{doc.department}</span>
                      {doc.qualification && (
                        <p className="doctor-qual">{doc.qualification}</p>
                      )}
                    </div>
                  </div>

                  <div className="doctor-card-meta">
                    <div className="meta-item">
                      <HospitalIcon size={15} />
                      <span>{doc.hospital_id.replace("hosp-", "").replace(/-/g, " ").toUpperCase()}</span>
                    </div>
                    {doc.consultation_fee && (
                      <div className="meta-item fee">
                        <CurrencyInr size={15} weight="bold" />
                        <span>₹{doc.consultation_fee} (Consultation)</span>
                      </div>
                    )}
                  </div>

                  <div className="doctor-card-actions">
                    <button
                      type="button"
                      className="btn-select-doctor"
                      onClick={() => handleOpenBooking(doc)}
                    >
                      <CalendarBlank size={16} weight="bold" />
                      <span>{isTa ? "நேரம் தேர்வு செய் & பதிவு" : "Select Slot & Book"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: BOOKING & SLOT SELECTION */}
      {/* ======================================================== */}
      {isBookingModalOpen && selectedDoctor && (
        <div className="modal-backdrop" onClick={() => !isSubmittingBooking && setIsBookingModalOpen(false)}>
          <div className="modal-card modal-booking" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {isTa ? "மருத்துவர் சந்திப்பு முன்பதிவு" : "Book Doctor Appointment"}
                </h3>
                <p className="modal-subtitle">
                  {selectedDoctor.name} &bull; {selectedDoctor.department}
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                disabled={isSubmittingBooking}
                onClick={() => setIsBookingModalOpen(false)}
              >
                &times;
              </button>
            </div>

            {bookingSuccessMessage ? (
              <StateFeedback
                state="success"
                title={isTa ? "முன்பதிவு வெற்றிகரமானது!" : "Appointment Scheduled!"}
                message={bookingSuccessMessage}
              />
            ) : (
              <form onSubmit={handleConfirmBooking} className="booking-modal-form">
                {/* Conflict / Error Banner */}
                {bookingConflictError && (
                  <div className="double-booking-warning" role="alert">
                    <WarningCircle size={20} weight="fill" className="warning-icon" />
                    <div>
                      <strong>{isTa ? "முன்பதிவு முரண்பாடு!" : "Double-Booking Conflict!"}</strong>
                      <p>{bookingConflictError}</p>
                    </div>
                  </div>
                )}

                {/* Caregiver Patient Selector (if caregiver) */}
                {isCaregiver && (
                  <div className="form-group highlight-box">
                    <label className="form-label">
                      <UserIcon size={15} weight="bold" />
                      <span>{isTa ? "எந்த நோயாளிக்கு முன்பதிவு செய்ய விரும்புகிறீர்கள்?" : "Booking for Patient:"}</span>
                    </label>
                    <select
                      className="form-input"
                      value={selectedPatientId}
                      onChange={(e) => setSelectedPatientId(e.target.value)}
                    >
                      {caregiverConsents.map((c) => (
                        <option key={c.patient_id} value={c.patient_id}>
                          {c.patient_name || c.patient_email || c.patient_id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Date Picker */}
                <div className="form-group">
                  <label className="form-label">
                    <CalendarBlank size={16} />
                    <span>{isTa ? "சந்திப்பு தேதி" : "Select Consultation Date"}</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split("T")[0]}
                    className="form-input"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>

                {/* Slot Grid */}
                <div className="form-group">
                  <div className="slots-header">
                    <label className="form-label">
                      <Clock size={16} />
                      <span>{isTa ? "கிடைக்கக்கூடிய நேர இடைவெளிகள்" : "Available Time Slots"}</span>
                    </label>
                    <span className="slots-hint">
                      {isTa ? "உடனடி இட ஒதுக்கீடு" : "Real-time Slot Locking"}
                    </span>
                  </div>

                  {isLoadingSlots ? (
                    <div className="slots-loading">
                      <StateFeedback
                        state="loading"
                        title={isTa ? "நேரங்கள் சரிபார்க்கப்படுகின்றன..." : "Checking available slots..."}
                      />
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="no-slots-alert">
                      <Info size={16} />
                      <span>
                        {isTa
                          ? "இந்த தேதியில் இடைவெளிகள் இல்லை. வேறு தேதியைத் தேர்ந்தெடுக்கவும்."
                          : "No available slots on this date. Please select an alternate date."}
                      </span>
                    </div>
                  ) : (
                    <div className="slots-grid">
                      {slots.map((s) => {
                        const timeStr = new Date(s.start_time).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        const isSelected = selectedSlot?.id === s.id;
                        const isBooked = s.is_booked;

                        return (
                          <button
                            key={s.id}
                            type="button"
                            disabled={isBooked}
                            className={`slot-pill ${isSelected ? "selected" : ""} ${isBooked ? "booked" : ""}`}
                            onClick={() => setSelectedSlot(s)}
                            title={isBooked ? "Slot already reserved" : `Select ${timeStr}`}
                          >
                            <span className="slot-time">{timeStr}</span>
                            {isBooked ? (
                              <span className="slot-status-tag booked">
                                {isTa ? "பதிவானது" : "Booked"}
                              </span>
                            ) : (
                              isSelected && <CheckCircle size={14} weight="fill" className="slot-check" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Booking Type: Confirmed vs Pending */}
                <div className="form-group">
                  <label className="form-label">
                    <Tag size={16} />
                    <span>{isTa ? "முன்பதிவு வகை" : "Booking Status / Confirmation Type"}</span>
                  </label>
                  <div className="booking-type-toggle">
                    <label className={`type-option ${bookingType === "confirmed" ? "active" : ""}`}>
                      <input
                        type="radio"
                        name="bookingType"
                        value="confirmed"
                        checked={bookingType === "confirmed"}
                        onChange={() => setBookingType("confirmed")}
                      />
                      <div>
                        <strong>{isTa ? "உறுதி செய்யப்பட்ட முன்பதிவு" : "Confirmed Booking"}</strong>
                        <p>{isTa ? "நேரடி முன்பதிவு உறுதிசெய்தல்." : "Direct instant slot reservation."}</p>
                      </div>
                    </label>

                    <label className={`type-option ${bookingType === "pending" ? "active" : ""}`}>
                      <input
                        type="radio"
                        name="bookingType"
                        value="pending"
                        checked={bookingType === "pending"}
                        onChange={() => setBookingType("pending")}
                      />
                      <div>
                        <strong>{isTa ? "நிலுவை கோரிக்கை" : "Pending Request"}</strong>
                        <p>{isTa ? "மருத்துவமனை ஒப்புதல் தேவை." : "Requires clinic staff review."}</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Notes / Reason */}
                <div className="form-group">
                  <label className="form-label">
                    <span>{isTa ? "ஆலோசனை நோக்கம் / குறிப்புகள் (விருப்பத்தேர்வு)" : "Reason for Visit / Symptoms (Optional)"}</span>
                  </label>
                  <textarea
                    rows={2}
                    className="form-input"
                    placeholder={
                      isTa
                        ? "எ.கா. இரத்த சர்க்கரை மறுபரிசீலனை, மூட்டு வலி..."
                        : "e.g., Follow-up consultation, medication review, persistent fever..."
                    }
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                  />
                </div>

                {/* Modal Footer Actions */}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    disabled={isSubmittingBooking}
                    onClick={() => setIsBookingModalOpen(false)}
                  >
                    {isTa ? "ரத்து செய்" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    className="modal-submit-btn"
                    disabled={isSubmittingBooking || !selectedSlot}
                  >
                    {isSubmittingBooking ? (
                      <span>{isTa ? "பதிவு செய்யப்படுகிறது..." : "Securing Slot..."}</span>
                    ) : (
                      <span>
                        {isTa
                          ? bookingType === "confirmed"
                            ? "முன்பதிவை உறுதிசெய்"
                            : "கோரிக்கையை அனுப்பு"
                          : bookingType === "confirmed"
                          ? "Confirm Booking"
                          : "Submit Request"}
                      </span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: CANCELLATION CONFIRMATION */}
      {/* ======================================================== */}
      {cancellationTarget && (
        <div className="modal-backdrop" onClick={() => !isCancelling && setCancellationTarget(null)}>
          <div className="modal-card modal-cancel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {isTa ? "சந்திப்பை ரத்து செய்ய விரும்புகிறீர்களா?" : "Cancel Scheduled Appointment?"}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                disabled={isCancelling}
                onClick={() => setCancellationTarget(null)}
              >
                &times;
              </button>
            </div>

            <div className="cancellation-body">
              <p className="cancel-warning-text">
                {isTa
                  ? "இந்த சந்திப்பை ரத்து செய்தால் ஒதுக்கப்பட்ட நேர இடைவெளி விடுவிக்கப்பட்டு மற்ற நோயாளிகளுக்கு கிடைக்கும்."
                  : "Cancelling will update your clinical record and immediately release the reserved slot back to the public pool."}
              </p>

              <div className="cancel-target-summary">
                <p><strong>{cancellationTarget.doctor_name}</strong> &bull; {cancellationTarget.department}</p>
                <p className="sub-text">{cancellationTarget.hospital_name}</p>
                <p className="sub-text">
                  {new Date(cancellationTarget.scheduled_time).toLocaleString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              {cancellationError && (
                <div className="double-booking-warning" role="alert">
                  <WarningCircle size={18} weight="fill" />
                  <span>{cancellationError}</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">{isTa ? "ரத்து செய்வதற்கான காரணம்" : "Reason for Cancellation"}</label>
                <select
                  className="form-input"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                >
                  <option value="Schedule conflict">{isTa ? "நேர முரண்பாடு" : "Schedule conflict"}</option>
                  <option value="Symptoms resolved / feeling better">{isTa ? "குணமடைந்துவிட்டேன்" : "Symptoms resolved / feeling better"}</option>
                  <option value="Need different specialist">{isTa ? "வேறு மருத்துவர் தேவை" : "Need different specialist"}</option>
                  <option value="Transportation issue">{isTa ? "போக்குவரத்து வசதி இன்மை" : "Transportation issue"}</option>
                  <option value="Other personal reason">{isTa ? "பிற தனிப்பட்ட காரணம்" : "Other personal reason"}</option>
                </select>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  disabled={isCancelling}
                  onClick={() => setCancellationTarget(null)}
                >
                  {isTa ? "பின்செல்" : "Keep Appointment"}
                </button>
                <button
                  type="button"
                  className="modal-confirm-cancel-btn"
                  disabled={isCancelling}
                  onClick={handleConfirmCancel}
                >
                  {isCancelling ? (
                    <span>{isTa ? "ரத்து செய்யப்படுகிறது..." : "Cancelling..."}</span>
                  ) : (
                    <span>{isTa ? "ஆம், ரத்து செய்" : "Confirm Cancellation"}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
