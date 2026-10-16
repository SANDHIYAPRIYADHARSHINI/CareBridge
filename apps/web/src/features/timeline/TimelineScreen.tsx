import React, { useState } from "react";
import {
  ClockCounterClockwise,
  FileText,
  Pill,
  CalendarCheck,
  CheckCircle,
  Funnel,
  ShieldCheck,
  ArrowSquareOut,
  Flask,
} from "@phosphor-icons/react";
import type { TimelineEvent, TimelineEventType } from "../../types/backend";
import { StateFeedback } from "../../components/ui/StateFeedback";
import "./TimelineScreen.css";

interface TimelineScreenProps {
  language: "en" | "ta";
  onOpenDocument?: (docUrl: string) => void;
}

const DEMO_EVENTS: TimelineEvent[] = [
  {
    id: "evt-1",
    patient_id: "patient-1",
    type: "appointment",
    title: "Upcoming Cardiology Consultation",
    description: "Scheduled with Dr. K. Senthil Nathan, MD at Apollo Speciality Hospital.",
    timestamp: "2026-10-19T10:30:00Z",
    is_verified: true,
  },
  {
    id: "evt-2",
    patient_id: "patient-1",
    type: "reminder",
    title: "Medication Schedule Updated",
    description: "Added Metformin 500mg BID and Atorvastatin 20mg based on verified prescription.",
    timestamp: "2026-10-15T09:15:00Z",
    is_verified: true,
  },
  {
    id: "evt-3",
    patient_id: "patient-1",
    type: "prescription",
    title: "Outpatient Prescription #AP-9041",
    description: "Extracted via CareBridge Vision Model with 3 medicines and verified evidence.",
    timestamp: "2026-10-14T11:45:00Z",
    document_url: "/rx_demo_001.png",
    is_verified: true,
  },
  {
    id: "evt-4",
    patient_id: "patient-1",
    type: "report",
    title: "Comprehensive Metabolic Panel & HbA1c",
    description: "HbA1c: 7.2% &bull; Serum Creatinine: 0.9 mg/dL &bull; Fasting Glucose: 134 mg/dL.",
    timestamp: "2026-10-10T08:30:00Z",
    is_verified: true,
  },
  {
    id: "evt-5",
    patient_id: "patient-1",
    type: "discharge",
    title: "Prior Discharge Summary (Feb 2026)",
    description: "Elective stent placement & post-op recovery instructions.",
    timestamp: "2026-02-18T14:00:00Z",
    is_verified: false,
  },
];

export const TimelineScreen: React.FC<TimelineScreenProps> = ({
  language,
}) => {
  const [filter, setFilter] = useState<TimelineEventType | "all">("all");
  const isTa = language === "ta";

  const filteredEvents = DEMO_EVENTS.filter(
    (e) => filter === "all" || e.type === filter
  );

  return (
    <div className="timeline-screen" lang={language}>
      {/* Header Banner */}
      <div className="timeline-banner">
        <div>
          <div className="badge-pill">
            <ClockCounterClockwise size={16} weight="fill" />
            <span>{isTa ? "ஒருங்கிணைந்த மருத்துவ காலக்கோடு" : "Unified Health Timeline"}</span>
          </div>
          <h1 className="timeline-title">
            {isTa ? "முழு மருத்துவ வரலாற்றுப் பதிவு" : "Chronological Clinical History"}
          </h1>
          <p className="timeline-sub">
            {isTa
              ? "மருந்துச் சீட்டுகள், ஆய்வகப் பரிசோதனைகள், நினைவூட்டல்கள் மற்றும் மருத்துவ சந்திப்புகளின் காலவரிசை."
              : "All medical records, verified prescriptions, adherence logs, and hospital appointments ordered chronologically."}
          </p>
        </div>

        <div className="synthetic-badge-pill">
          <Flask size={14} weight="bold" />
          <span>{isTa ? "மாதிரி காலக்கோடு தரவு" : "Synthetic Longitudinal Records"}</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="timeline-filters-bar">
        <div className="filter-label">
          <Funnel size={16} />
          <span>{isTa ? "வடிகட்டு:" : "Filter:"}</span>
        </div>
        <div className="filter-buttons">
          {(["all", "prescription", "reminder", "appointment", "report"] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={`filter-btn ${filter === type ? "active" : ""}`}
              onClick={() => setFilter(type)}
            >
              {type === "all"
                ? isTa ? "அனைத்தும்" : "All Events"
                : type === "prescription"
                ? isTa ? "மருந்துச் சீட்டுகள்" : "Prescriptions"
                : type === "reminder"
                ? isTa ? "நினைவூட்டல்கள்" : "Reminders"
                : type === "appointment"
                ? isTa ? "சந்திப்புகள்" : "Appointments"
                : isTa ? "ஆய்வக அறிக்கைகள்" : "Reports"}
            </button>
          ))}
        </div>
      </div>

      {/* Events Timeline */}
      {filteredEvents.length === 0 ? (
        <StateFeedback
          state="empty"
          title={isTa ? "நிகழ்வுகள் எதுவும் இல்லை" : "No events found"}
          message={isTa ? "தேர்ந்தெடுக்கப்பட்ட வடிகட்டியில் எந்த பதிவுகளும் இல்லை." : "There are no events matching this category."}
        />
      ) : (
        <div className="timeline-track">
          {filteredEvents.map((evt) => {
            const dateObj = new Date(evt.timestamp);
            const dateStr = dateObj.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });

            return (
              <div key={evt.id} className="timeline-node">
                <div className="timeline-marker">
                  <div className={`node-icon-circle ${evt.type}`}>
                    {evt.type === "prescription" && <FileText size={16} weight="bold" />}
                    {evt.type === "reminder" && <Pill size={16} weight="bold" />}
                    {evt.type === "appointment" && <CalendarCheck size={16} weight="bold" />}
                    {evt.type === "report" && <FileText size={16} weight="bold" />}
                    {evt.type === "discharge" && <FileText size={16} weight="bold" />}
                  </div>
                  <div className="timeline-line" />
                </div>

                <div className="timeline-content-card">
                  <div className="node-top-row">
                    <span className="node-date">{dateStr}</span>
                    <div className="badges-group">
                      <span className={`type-tag ${evt.type}`}>{evt.type.toUpperCase()}</span>
                      {evt.is_verified && (
                        <span className="verified-pill">
                          <CheckCircle size={12} weight="fill" />
                          <span>{isTa ? "சரிபார்க்கப்பட்டது" : "Verified"}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="node-title">{evt.title}</h3>
                  <p className="node-desc">{evt.description}</p>

                  {evt.document_url && (
                    <div className="node-footer">
                      <a
                        href={evt.document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="doc-link-btn"
                      >
                        <ArrowSquareOut size={14} weight="bold" />
                        <span>{isTa ? "அசல் ஆவணத்தைப் பார் (PNG)" : "View Original Document"}</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Caregiver Consent Notice */}
      <div className="timeline-governance-card">
        <ShieldCheck size={20} weight="fill" className="shield-icon" />
        <p>
          {isTa
            ? "அங்கீகரிக்கப்பட்ட பராமரிப்பாளர்கள் நீங்கள் அனுமதித்த நிகழ்வுகளை மட்டுமே காண முடியும்."
            : "Authorized family caregivers can only see events you have granted explicit consent to view."}
        </p>
      </div>
    </div>
  );
};
