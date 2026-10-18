import React, { useState, useEffect } from "react";
import {
  Sun,
  PlusCircle,
  FileText,
  Hospital as HospitalIcon,
  CalendarCheck,
  ClockCounterClockwise,
  CheckCircle,
  Clock,
  WarningCircle,
  PhoneCall,
  CaretRight,
  ShieldCheck,
  Flask,
  NotePencil,
} from "@phosphor-icons/react";
import type { MedicineReminder, Hospital, Appointment } from "../../types/backend";
import { getReminders } from "../../services/api";
import { StateFeedback, type FeedbackState } from "../../components/ui/StateFeedback";
import "./PatientDashboard.css";

interface PatientDashboardProps {
  language: string;
  onNavigateToTab: (tab: string) => void;
  onScanPrescription: () => void;
}

// Synthetic demo data for dashboard preview
const DEMO_REMINDERS: MedicineReminder[] = [
  {
    id: "rem-1",
    patient_id: "patient-demo-1",
    medicine_name: "Metformin Hydrochloride",
    dosage: "500 mg",
    instructions: "Take with meals to minimize gastrointestinal discomfort",
    times_per_day: 2,
    slots: ["morning", "night"],
    total_supply: 60,
    remaining_supply: 14,
    refill_threshold: 10,
    is_verified_rx: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "rem-2",
    patient_id: "patient-demo-1",
    medicine_name: "Atorvastatin Calcium",
    dosage: "20 mg",
    instructions: "Take once daily in the evening",
    times_per_day: 1,
    slots: ["evening"],
    total_supply: 30,
    remaining_supply: 4,
    refill_threshold: 5,
    is_verified_rx: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "rem-3",
    patient_id: "patient-demo-1",
    medicine_name: "Telmisartan",
    dosage: "40 mg",
    instructions: "Take once in the morning after breakfast",
    times_per_day: 1,
    slots: ["morning"],
    total_supply: 30,
    remaining_supply: 22,
    refill_threshold: 7,
    is_verified_rx: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_APPOINTMENT: Appointment = {
  id: "apt-1",
  patient_id: "patient-demo-1",
  hospital_id: "hosp-1",
  hospital_name: "Apollo Speciality Hospital (Greams Road)",
  doctor_name: "Dr. K. Senthil Nathan, MD",
  department: "Cardiology & Diabetology",
  scheduled_time: new Date(Date.now() + 86400000 * 2).toISOString(), // 2 days later
  status: "confirmed",
  notes: "Follow-up HbA1c review and blood pressure check.",
  created_at: new Date().toISOString(),
};

const DEMO_EMERGENCY_HOSPITAL: Hospital = {
  id: "hosp-1",
  name: "Apollo Speciality Hospital (Greams Road)",
  address: "21 Greams Lane, Thousand Lights, Chennai",
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
  last_updated: new Date().toISOString(),
  is_simulated: true,
};

export const PatientDashboard: React.FC<PatientDashboardProps> = ({
  language,
  onNavigateToTab,
  onScanPrescription,
}) => {
  const [viewState] = useState<FeedbackState>("success");
  const [reminders, setReminders] = useState<MedicineReminder[]>(DEMO_REMINDERS);
  const isTa = language === "ta";

  useEffect(() => {
    getReminders()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setReminders(data);
        }
      })
      .catch(() => {
        // Fallback to DEMO_REMINDERS
      });
  }, []);

  // Dose adherence metrics
  const totalDosesToday = reminders.reduce((acc, r) => acc + (r.slots?.length || 1), 0) || 4;
  const dosesTakenToday = Math.min(2, totalDosesToday);
  const adherenceRate = Math.round((dosesTakenToday / totalDosesToday) * 100);

  if (viewState === "loading") {
    return (
      <StateFeedback
        state="loading"
        title={isTa ? "டாஷ்போர்டு ஏற்றப்படுகிறது..." : "Loading Patient Dashboard..."}
        message={isTa ? "மருத்துவ தகவல்கள் பெறப்படுகின்றன." : "Retrieving patient care summaries."}
      />
    );
  }

  if (viewState === "error") {
    return (
      <StateFeedback
        state="error"
        title={isTa ? "தகவல் பெற முடியவில்லை" : "Failed to load dashboard"}
        message={isTa ? "இணைப்பைச் சரிபார்க்கவும்." : "Please verify your network connection."}
        actionLabel={isTa ? "மீண்டும் முயற்சி செய்" : "Retry"}
        onAction={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="patient-dashboard" lang={language}>
      {/* Welcome Banner */}
      <div className="dashboard-welcome-banner">
        <div className="welcome-text-group">
          <div className="welcome-badge">
            <ShieldCheck size={16} weight="fill" />
            <span>{isTa ? "பாதுகாக்கப்பட்ட நோயாளி தளம்" : "Patient Care Overview"}</span>
          </div>
          <h1 className="welcome-title">
            {isTa ? "வணக்கம், காவியா!" : "Good Morning, Kaviya"}
          </h1>
          <p className="welcome-subtitle">
            {isTa
              ? "இன்றைய மருந்து அட்டவணை மற்றும் மருத்துவ நிகழ்வுகளின் சுருக்கம்."
              : "Here is your medication adherence and health overview for today."}
          </p>
        </div>

        <div className="synthetic-badge-pill" title="Synthetic Patient Data">
          <Flask size={14} weight="bold" />
          <span>{isTa ? "மாதிரி நோயாளி தரவு" : "Synthetic Demo Records"}</span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="dashboard-metrics-grid">
        {/* Metric 1: Medication Adherence */}
        <div className="metric-card metric-adherence" onClick={() => onNavigateToTab("reminders")} role="button" tabIndex={0}>
          <div className="metric-header">
            <span className="metric-label">{isTa ? "இன்றைய மருந்துகள்" : "Today's Adherence"}</span>
            <Sun size={20} weight="fill" className="metric-icon adherence-icon" />
          </div>
          <div className="metric-value-row">
            <span className="metric-main-value">{adherenceRate}%</span>
            <span className="metric-sub-value">({dosesTakenToday}/{totalDosesToday} {isTa ? "முடிக்கப்பட்டது" : "Doses"})</span>
          </div>
          <div className="adherence-progress-bar">
            <div className="adherence-progress-fill" style={{ width: `${adherenceRate}%` }} />
          </div>
          <div className="metric-footer-link">
            <span>{isTa ? "அட்டவணையைப் பார்" : "View Medication Schedule"}</span>
            <CaretRight size={14} weight="bold" />
          </div>
        </div>

        {/* Metric 2: Next Appointment */}
        <div className="metric-card metric-appointment" onClick={() => onNavigateToTab("appointments")} role="button" tabIndex={0}>
          <div className="metric-header">
            <span className="metric-label">{isTa ? "அடுத்த மருத்துவ சந்திப்பு" : "Next Appointment"}</span>
            <CalendarCheck size={20} weight="fill" className="metric-icon appointment-icon" />
          </div>
          <div className="appointment-details">
            <div className="apt-doctor-name">{DEMO_APPOINTMENT.doctor_name}</div>
            <div className="apt-dept">{DEMO_APPOINTMENT.department}</div>
            <div className="apt-time-row">
              <Clock size={14} weight="bold" />
              <span>{isTa ? "2 நாட்களில் (காலை 10:30)" : "In 2 days (10:30 AM)"}</span>
            </div>
          </div>
          <div className="metric-footer-link">
            <span>{isTa ? "சந்திப்புகளை நிர்வகி" : "Manage Appointments"}</span>
            <CaretRight size={14} weight="bold" />
          </div>
        </div>

        {/* Metric 3: Emergency Hospital Status */}
        <div className="metric-card metric-emergency" onClick={() => onNavigateToTab("hospitals")} role="button" tabIndex={0}>
          <div className="metric-header">
            <span className="metric-label">{isTa ? "அவசர பிரிவு நிலை" : "Nearest Emergency Dept"}</span>
            <HospitalIcon size={20} weight="fill" className="metric-icon emergency-icon" />
          </div>
          <div className="emergency-details">
            <div className="hosp-name">{DEMO_EMERGENCY_HOSPITAL.name}</div>
            <div className="hosp-stats">
              <span className="hosp-chip normal-status">{isTa ? "சாதாரண நிலை" : "Normal Capacity"}</span>
              <span className="hosp-wait">{isTa ? "காத்திருப்பு: ~15 நிமிடம்" : "~15m wait"}</span>
            </div>
            <div className="hosp-beds">
              {DEMO_EMERGENCY_HOSPITAL.icu_available} {isTa ? "ஐசியூ படுக்கைகள் தயார்" : "ICU beds available"}
            </div>
          </div>
          <div className="metric-footer-link">
            <span>{isTa ? "மருத்துவமனை வழிகாட்டி" : "Open Hospital Finder"}</span>
            <CaretRight size={14} weight="bold" />
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts */}
      <section className="dashboard-section">
        <h2 className="section-heading">{isTa ? "விரைவு சேவைகள்" : "Quick Actions"}</h2>
        <div className="quick-actions-grid">
          <button type="button" className="action-tile-btn primary-action" onClick={onScanPrescription}>
            <div className="action-tile-icon-circle">
              <PlusCircle size={24} weight="bold" />
            </div>
            <div className="action-tile-text">
              <span className="action-tile-title">{isTa ? "மருந்துச் சீட்டைப் பதிவேற்று" : "Scan Prescription"}</span>
              <span className="action-tile-desc">{isTa ? "AI மூலம் மருந்து விவரங்களைச் சரிபார்" : "AI OCR & clinical validation"}</span>
            </div>
          </button>

          <button type="button" className="action-tile-btn" onClick={() => onNavigateToTab("reminders")}>
            <div className="action-tile-icon-circle reminder-circle">
              <Sun size={24} weight="bold" />
            </div>
            <div className="action-tile-text">
              <span className="action-tile-title">{isTa ? "மருந்து நினைவூட்டல்கள்" : "Medicine Reminders"}</span>
              <span className="action-tile-desc">{isTa ? "வேளை மருந்துகள் & இருப்பு" : "Track doses & refills"}</span>
            </div>
          </button>

          <button type="button" className="action-tile-btn" onClick={() => onNavigateToTab("timeline")}>
            <div className="action-tile-icon-circle timeline-circle">
              <ClockCounterClockwise size={24} weight="bold" />
            </div>
            <div className="action-tile-text">
              <span className="action-tile-title">{isTa ? "ஒருங்கிணைந்த காலக்கோடு" : "Health Timeline"}</span>
              <span className="action-tile-desc">{isTa ? "முந்தைய ஆவணங்கள் & பதிவுகள்" : "Prescriptions & reports"}</span>
            </div>
          </button>

          <button type="button" className="action-tile-btn" onClick={() => onNavigateToTab("hospitals")}>
            <div className="action-tile-icon-circle hospital-circle">
              <HospitalIcon size={24} weight="bold" />
            </div>
            <div className="action-tile-text">
              <span className="action-tile-title">{isTa ? "மருத்துவமனை வரைபடம்" : "Hospital Finder"}</span>
              <span className="action-tile-desc">{isTa ? "படுக்கை இருப்பு & அவசர உதவி" : "ED capacity & navigation"}</span>
            </div>
          </button>
        </div>
      </section>

      {/* Main Two-Column Layout: Active Medications & Recent History */}
      <div className="dashboard-content-grid">
        {/* Left Column: Active Prescription Schedule */}
        <section className="dashboard-card active-reminders-card">
          <div className="card-header-row">
            <div>
              <h3 className="card-title">{isTa ? "செயலில் உள்ள மருந்துகள்" : "Active Medications"}</h3>
              <p className="card-subtitle">{isTa ? "மருத்துவரால் பரிந்துரைக்கப்பட்ட வேளைகள்" : "Prescribed daily regimen"}</p>
            </div>
            <button
              type="button"
              className="card-text-action"
              onClick={() => onNavigateToTab("reminders")}
            >
              {isTa ? "அனைத்தும்" : "View All"}
            </button>
          </div>

          <div className="reminders-list">
            {reminders.slice(0, 4).map((med) => {
              const isLowSupply =
                med.remaining_supply !== undefined &&
                med.refill_threshold !== undefined &&
                med.remaining_supply <= med.refill_threshold;
              return (
                <div key={med.id} className="reminder-item-row">
                  <div className="reminder-info">
                    <div className="reminder-name-row">
                      <span className="med-name">{med.medicine_name}</span>
                      <span className="med-dosage">{med.dosage}</span>
                      {med.is_verified_rx ? (
                        <span className="verified-pill" title="Verified from prescription">
                          <CheckCircle size={12} weight="fill" />
                          <span>{isTa ? "சரிபார்க்கப்பட்டது" : "Rx Verified"}</span>
                        </span>
                      ) : (
                        <span className="manual-pill" title="Manually entered by patient">
                          <NotePencil size={12} weight="bold" />
                          <span>{isTa ? "கைமுறை" : "Manual"}</span>
                        </span>
                      )}
                    </div>
                    <div className="med-timing">
                      <Clock size={14} />
                      <span>{med.slots.join(", ")} &bull; {med.instructions}</span>
                    </div>
                  </div>

                  <div className="reminder-supply-badge">
                    {isLowSupply ? (
                      <span className="supply-tag low-tag">
                        <WarningCircle size={14} weight="fill" />
                        <span>{med.remaining_supply} {isTa ? "மீதம் (மறு நிரப்பல்)" : "left (Refill)"}</span>
                      </span>
                    ) : (
                      <span className="supply-tag normal-tag">
                        <span>{med.remaining_supply} {isTa ? "அளவுகள் மீதம்" : "doses left"}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right Column: Emergency & Caregiver Status */}
        <div className="dashboard-side-column">
          {/* Emergency SOS Shortcut Card */}
          <section className="dashboard-card emergency-call-card">
            <div className="emergency-header">
              <PhoneCall size={24} weight="fill" className="emergency-phone-icon" />
              <div>
                <h3 className="card-title text-danger">{isTa ? "அவசர கால உதவி எண்" : "Emergency Helpline"}</h3>
                <p className="card-subtitle">{isTa ? "உடனடி ஆம்புலன்ஸ் & அவசர உதவி" : "Immediate medical assistance"}</p>
              </div>
            </div>
            <div className="emergency-actions">
              <a href="tel:108" className="emergency-call-btn">
                <span>{isTa ? "அழைக்க: 108 (ஆம்புலன்ஸ்)" : "Call 108 (Ambulance)"}</span>
              </a>
              <a href="tel:14416" className="emergency-helpline-sub-btn">
                <span>{isTa ? "Tele-MANAS: 14416" : "Tele-MANAS Crisis: 14416"}</span>
              </a>
            </div>
          </section>

          {/* Recent Prescription Extraction Card */}
          <section className="dashboard-card recent-rx-card">
            <div className="card-header-row">
              <h3 className="card-title">{isTa ? "சமீபத்திய மருந்துச் சீட்டு" : "Recent Prescription"}</h3>
              <span className="status-tag ready">{isTa ? "ஆயத்த நிலை" : "Ready"}</span>
            </div>
            <div className="recent-rx-body">
              <div className="rx-preview-meta">
                <FileText size={32} weight="duotone" className="rx-doc-icon" />
                <div>
                  <div className="rx-meta-title">Dr. Senthil Nathan (Cardiology)</div>
                  <div className="rx-meta-sub">Dated: 14 Oct 2026 &bull; 3 Medicines</div>
                </div>
              </div>
              <button
                type="button"
                className="review-rx-link-btn"
                onClick={() => onNavigateToTab("check")}
              >
                <span>{isTa ? "பிரித்தெடுக்கப்பட்ட விவரங்களைச் சரிபார்" : "Review Extracted Data"}</span>
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
