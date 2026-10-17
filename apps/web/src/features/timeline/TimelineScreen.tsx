import React, { useState, useEffect, useCallback } from "react";
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
  WarningCircle,
  MagnifyingGlass,
  X,
  Eye,
  Info,
  Clock,
  FirstAid,
} from "@phosphor-icons/react";
import type { TimelineEvent, TimelineEventType } from "../../types/backend";
import { getTimeline } from "../../services/api";
import { StateFeedback } from "../../components/ui/StateFeedback";
import "./TimelineScreen.css";

interface TimelineScreenProps {
  language: "en" | "ta";
  onOpenDocument?: (docUrl: string) => void;
  patientId?: string; // For caregiver inspection
  isCaregiverView?: boolean;
}

const FALLBACK_EVENTS: TimelineEvent[] = [
  {
    id: "evt-1",
    patient_id: "patient-1",
    type: "appointment",
    title: "Upcoming Cardiology Consultation",
    description: "Review of cardiovascular metrics and HbA1c control with Dr. K. Senthil Nathan, MD.",
    timestamp: "2026-10-19T10:30:00Z",
    source: "Apollo Hospital Scheduling System",
    doctor_name: "Dr. K. Senthil Nathan, MD",
    hospital_name: "Apollo Speciality Hospital (Greams Road)",
    is_verified: true,
    status: "confirmed",
    flags: [],
  },
  {
    id: "evt-dose-1",
    patient_id: "patient-1",
    type: "dose_log",
    title: "Dose Adherence: Metformin 500mg — TAKEN",
    description: "Morning dose taken with breakfast on schedule.",
    timestamp: "2026-10-17T08:15:00Z",
    source: "CareBridge Adherence Tracker",
    is_verified: true,
    status: "taken",
    flags: [],
  },
  {
    id: "evt-2",
    patient_id: "patient-1",
    type: "reminder",
    title: "Medication Schedule Updated (3 Prescriptions Active)",
    description: "Synchronized Metformin 500mg, Atorvastatin 20mg, and Telmisartan 40mg into daily routine.",
    timestamp: "2026-10-15T09:15:00Z",
    source: "Verified Prescription Regimen",
    is_verified: true,
    status: "active",
    flags: [],
  },
  {
    id: "evt-3",
    patient_id: "patient-1",
    type: "prescription",
    title: "Outpatient Prescription #AP-9041 (Cardiology & Diabetology)",
    description: "Cardiology follow-up prescription with 3 verified medicines extracted via Member 1 AI Vision model.",
    timestamp: "2026-10-14T11:45:00Z",
    source: "Member 1 AI Prescription Extraction",
    doctor_name: "Dr. K. Senthil Nathan, MD",
    hospital_name: "Apollo Speciality Hospital (Greams Road)",
    document_url: "/rx_demo_001.png",
    is_verified: true,
    confidence: 0.96,
    status: "verified",
    flags: [],
    metadata: {
      medicines_count: 3,
      medicines: [
        { name: "Metformin Hydrochloride", dosage: "500 mg", frequency: "1-0-1" },
        { name: "Atorvastatin Calcium", dosage: "20 mg", frequency: "0-0-1" },
        { name: "Telmisartan", dosage: "40 mg", frequency: "1-0-0" },
      ],
    },
  },
  {
    id: "evt-4",
    patient_id: "patient-1",
    type: "report",
    title: "Comprehensive Metabolic Panel & Glycated Hemoglobin (HbA1c)",
    description: "Fasting Blood Sugar: 134 mg/dL (Elevated), HbA1c: 7.2% (Fair control), Serum Creatinine: 0.9 mg/dL.",
    timestamp: "2026-10-08T08:30:00Z",
    source: "Metropolis Diagnostic Laboratory",
    doctor_name: "Dr. Priya Ramaswamy, Pathologist",
    hospital_name: "Metropolis Diagnostic Center",
    document_url: "/lab_report_demo.pdf",
    is_verified: true,
    confidence: 0.98,
    status: "verified",
    flags: [],
  },
  {
    id: "evt-5",
    patient_id: "patient-1",
    type: "discharge",
    title: "Inpatient Discharge Summary — Elective Angioplasty (LAD DES)",
    description: "Elective stent placement with successful post-op recovery. Caution: 6-month cardiology follow-up is overdue.",
    timestamp: "2026-02-18T14:00:00Z",
    source: "Hospital Electronic Medical Record",
    doctor_name: "Dr. V. Anand, MCh (Cardio)",
    hospital_name: "Apollo Hospital (Greams Road)",
    document_url: "/discharge_summary_demo.pdf",
    is_verified: true,
    confidence: 0.91,
    status: "needs_review",
    flags: ["Follow-up overdue (>6 months)", "Requires updated echocardiogram screening"],
  },
];

export const TimelineScreen: React.FC<TimelineScreenProps> = ({
  language,
  onOpenDocument,
  patientId,
  isCaregiverView = false,
}) => {
  const [events, setEvents] = useState<TimelineEvent[]>(FALLBACK_EVENTS);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<TimelineEventType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState<{
    url: string;
    title: string;
    source?: string;
  } | null>(null);

  const isTa = language === "ta";

  const fetchTimelineEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getTimeline(patientId, filter === "all" ? undefined : filter);
      if (res && Array.isArray(res.events) && res.events.length > 0) {
        setEvents(res.events);
      }
    } catch {
      // Fallback gracefully to rich synthetic records
      setEvents(FALLBACK_EVENTS);
    } finally {
      setLoading(false);
    }
  }, [patientId, filter]);

  useEffect(() => {
    fetchTimelineEvents();
  }, [fetchTimelineEvents]);

  // Client-side filtering by category & search query
  const filteredEvents = events.filter((e) => {
    const matchesFilter = filter === "all" || e.type === filter;
    if (!matchesFilter) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = e.title.toLowerCase().includes(q);
    const descMatch = (e.description || "").toLowerCase().includes(q);
    const docMatch = (e.doctor_name || "").toLowerCase().includes(q);
    const hospMatch = (e.hospital_name || "").toLowerCase().includes(q);
    const srcMatch = (e.source || "").toLowerCase().includes(q);
    return titleMatch || descMatch || docMatch || hospMatch || srcMatch;
  });

  const handleDocumentClick = (docUrl: string, title: string, source?: string) => {
    if (onOpenDocument) {
      onOpenDocument(docUrl);
    } else {
      setSelectedPreviewDoc({ url: docUrl, title, source });
    }
  };

  const getEventIcon = (type: TimelineEventType) => {
    switch (type) {
      case "prescription":
        return <FileText size={18} weight="bold" />;
      case "reminder":
        return <Pill size={18} weight="bold" />;
      case "dose_log":
        return <CheckCircle size={18} weight="bold" />;
      case "appointment":
        return <CalendarCheck size={18} weight="bold" />;
      case "report":
        return <FileText size={18} weight="bold" />;
      case "discharge":
        return <FirstAid size={18} weight="bold" />;
      default:
        return <Clock size={18} weight="bold" />;
    }
  };

  return (
    <div className="timeline-screen" lang={language}>
      {/* Header Banner */}
      <div className="timeline-banner">
        <div>
          <div className="badge-pill">
            <ClockCounterClockwise size={16} weight="fill" />
            <span>
              {isTa ? "ஒருங்கிணைந்த மருத்துவ காலக்கோடு" : "Unified Health Timeline"}
            </span>
          </div>
          <h1 className="timeline-title">
            {isTa ? "முழு மருத்துவ வரலாற்றுப் பதிவு" : "Chronological Clinical History"}
          </h1>
          <p className="timeline-sub">
            {isTa
              ? "மருந்துச் சீட்டுகள், ஆய்வகப் பரிசோதனைகள், மருந்து அட்டவணை, மற்றும் மருத்துவ சந்திப்புகளின் முழுமையான காலவரிசைப் பதிவு."
              : "Comprehensive longitudinal record integrating verified prescriptions, lab reports, discharge summaries, adherence logs, and hospital appointments."}
          </p>
        </div>

        <div className="banner-side-group">
          <div className="synthetic-badge-pill">
            <Flask size={14} weight="bold" />
            <span>{isTa ? "மாதிரி காலக்கோடு தரவு" : "Synthetic Clinical History"}</span>
          </div>
          <div className="timeline-count-badge">
            <span>{filteredEvents.length} {isTa ? "நிகழ்வுகள்" : "Events"}</span>
          </div>
        </div>
      </div>

      {/* Caregiver Audit Banner if active */}
      {isCaregiverView && (
        <div className="caregiver-audit-banner" role="status">
          <Info size={18} weight="bold" />
          <span>
            {isTa
              ? "கவனிப்பாளர் பார்வை: நோயாளி அனுமதித்த பதிவுகள் மட்டுமே காட்டப்படுகின்றன. ஒவ்வொரு அணுகலும் தணிக்கைப் பதிவேட்டில் பதிவு செய்யப்படுகிறது."
              : "Caregiver View: Showing timeline records permitted under active patient consent settings. This access is logged in the compliance audit ledger."}
          </span>
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className="timeline-controls-bar">
        <div className="timeline-search-box">
          <MagnifyingGlass size={16} className="search-icon" />
          <input
            type="text"
            placeholder={
              isTa
                ? "மருந்து, மருத்துவர், மருத்துவமனை அல்லது தேடல் சொல்லை உள்ளிடவும்..."
                : "Search timeline by medicine, doctor, hospital, or finding..."
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
              <X size={14} />
            </button>
          )}
        </div>

        <div className="timeline-filters-bar">
          <div className="filter-label">
            <Funnel size={16} />
            <span>{isTa ? "வடிகட்டு:" : "Filter:"}</span>
          </div>
          <div className="filter-buttons">
            {(
              [
                "all",
                "prescription",
                "report",
                "discharge",
                "reminder",
                "dose_log",
                "appointment",
              ] as const
            ).map((type) => (
              <button
                key={type}
                type="button"
                className={`filter-btn ${filter === type ? "active" : ""}`}
                onClick={() => setFilter(type)}
              >
                {type === "all"
                  ? isTa
                    ? "அனைத்தும்"
                    : "All"
                  : type === "prescription"
                  ? isTa
                    ? "மருந்துச் சீட்டுகள்"
                    : "Prescriptions"
                  : type === "report"
                  ? isTa
                    ? "ஆய்வக அறிக்கைகள்"
                    : "Lab Reports"
                  : type === "discharge"
                  ? isTa
                    ? "வெளியேற்ற சுருக்கம்"
                    : "Discharge"
                  : type === "reminder"
                  ? isTa
                    ? "நினைவூட்டல்கள்"
                    : "Reminders"
                  : type === "dose_log"
                  ? isTa
                    ? "மருந்து பதிவுகள்"
                    : "Dose Logs"
                  : isTa
                  ? "சந்திப்புகள்"
                  : "Appointments"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events Timeline */}
      {loading ? (
        <div className="timeline-loading-state">
          <Clock size={24} className="spinning-icon" />
          <span>{isTa ? "காலக்கோடு ஏற்றப்படுகிறது..." : "Loading clinical timeline..."}</span>
        </div>
      ) : filteredEvents.length === 0 ? (
        <StateFeedback
          state="empty"
          title={isTa ? "பதிவுகள் எதுவும் இல்லை" : "No records found"}
          message={
            isTa
              ? "தேர்ந்தெடுக்கப்பட்ட வடிகட்டியில் அல்லது தேடலில் எந்த மருத்துவ நிகழ்வுகளும் கிடைக்கவில்லை."
              : "There are no timeline records matching this filter or search query."
          }
          actionLabel={searchQuery || filter !== "all" ? (isTa ? "வடிகட்டியை மீட்டமை" : "Reset Filters") : undefined}
          onAction={() => {
            setFilter("all");
            setSearchQuery("");
          }}
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
            const timeStr = dateObj.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            });

            const hasFlags = Array.isArray(evt.flags) && evt.flags.length > 0;

            return (
              <div key={evt.id} className="timeline-node">
                <div className="timeline-marker">
                  <div className={`node-icon-circle ${evt.type}`}>
                    {getEventIcon(evt.type)}
                  </div>
                  <div className="timeline-line" />
                </div>

                <div className={`timeline-content-card ${hasFlags ? "has-flags" : ""}`}>
                  <div className="node-top-row">
                    <div className="node-date-group">
                      <span className="node-date">{dateStr}</span>
                      <span className="node-time">&bull; {timeStr}</span>
                    </div>

                    <div className="badges-group">
                      <span className={`type-tag ${evt.type}`}>
                        {evt.type.replace("_", " ").toUpperCase()}
                      </span>

                      {evt.confidence !== undefined && (
                        <span className="confidence-pill" title="Clinical OCR extraction confidence">
                          {Math.round(evt.confidence * 100)}% {isTa ? "நம்பகத்தன்மை" : "match"}
                        </span>
                      )}

                      {evt.is_verified ? (
                        <span className="verified-pill">
                          <CheckCircle size={12} weight="fill" />
                          <span>{isTa ? "சரிபார்க்கப்பட்டது" : "Verified"}</span>
                        </span>
                      ) : (
                        <span className="unverified-pill">
                          <WarningCircle size={12} weight="bold" />
                          <span>{isTa ? "சுய பதிவு" : "Self-Reported"}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="node-title">{evt.title}</h3>

                  {evt.description && <p className="node-desc">{evt.description}</p>}

                  {/* Clinical Context / Origin */}
                  {(evt.doctor_name || evt.hospital_name || evt.source) && (
                    <div className="node-context-row">
                      {evt.doctor_name && (
                        <span className="context-item doctor">
                          <strong>{isTa ? "மருத்துவர்:" : "Clinician:"}</strong> {evt.doctor_name}
                        </span>
                      )}
                      {evt.hospital_name && (
                        <span className="context-item hospital">
                          <strong>{isTa ? "மருத்துவமனை:" : "Facility:"}</strong> {evt.hospital_name}
                        </span>
                      )}
                      {evt.source && (
                        <span className="context-item source">
                          <strong>{isTa ? "மூலம்:" : "Source:"}</strong> {evt.source}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Prominent Cautionary Flags Callout */}
                  {hasFlags && (
                    <div className="timeline-flags-banner" role="alert">
                      <WarningCircle size={16} weight="fill" className="flag-icon" />
                      <div className="flag-text">
                        <strong>{isTa ? "கவனிக்கப்பட வேண்டியவை (Clinical Flag):" : "Clinical Warning / Review Flag:"}</strong>
                        <ul>
                          {evt.flags!.map((flag, idx) => (
                            <li key={idx}>{flag}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Document Preview / Link Action */}
                  {evt.document_url && (
                    <div className="node-footer">
                      <button
                        type="button"
                        className="doc-preview-btn"
                        onClick={() =>
                          handleDocumentClick(
                            evt.document_url!,
                            evt.title,
                            evt.source
                          )
                        }
                      >
                        <Eye size={16} weight="bold" />
                        <span>{isTa ? "அசல் ஆவணத்தை முன்னோட்டமிடு" : "Preview Document Scan"}</span>
                      </button>

                      <a
                        href={evt.document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="doc-link-btn"
                      >
                        <ArrowSquareOut size={14} weight="bold" />
                        <span>{isTa ? "புதிய தாவலில் திற" : "Open in New Tab"}</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Non-negotiable Clinical Governance & Safety Notice */}
      <div className="timeline-governance-card">
        <ShieldCheck size={24} weight="fill" className="shield-icon" />
        <div className="governance-text">
          <h4>{isTa ? "மருத்துவப் பதிவுகள் பாதுகாப்பு வழிகாட்டல்" : "Clinical Data Sovereignty & Adherence Notice"}</h4>
          <p>
            {isTa
              ? "கேர்பிரிட்ஜ் காலக்கோடு உங்கள் சரிபார்க்கப்பட்ட மருத்துவ ஆவணங்கள் மற்றும் நிகழ்வுகளைக் காட்சிப்படுத்துகிறது. இது மருத்துவ நோயறிதல் அல்ல. உங்கள் குடும்ப கவனிப்பாளர்கள் நீங்கள் வெளிப்படையாக அனுமதித்த பகுதிகளை மட்டுமே பார்க்க முடியும்."
              : "CareBridge Unified Health Timeline synthesizes verified prescriptions, lab reports, and adherence records under patient sovereign consent. It does not provide medical diagnoses or alter prescribed regimens. Authorized family caregivers can only view events explicitly approved by the patient."}
          </p>
        </div>
      </div>

      {/* Document Preview Modal */}
      {selectedPreviewDoc && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-container doc-preview-modal">
            <div className="modal-header">
              <div className="modal-title-row">
                <FileText size={20} weight="fill" color="var(--primary)" />
                <div>
                  <h3 className="doc-preview-modal-title">{selectedPreviewDoc.title}</h3>
                  {selectedPreviewDoc.source && (
                    <span className="doc-preview-modal-source">
                      {isTa ? "மூலம்:" : "Source:"} {selectedPreviewDoc.source}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedPreviewDoc(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="doc-preview-modal-body">
              {selectedPreviewDoc.url.endsWith(".pdf") ? (
                <div className="pdf-preview-box">
                  <FileText size={48} weight="duotone" color="#0284c7" />
                  <p>{isTa ? "மருத்துவ ஆவணம் (PDF வடிவம்)" : "Clinical Document (PDF Format)"}</p>
                  <a
                    href={selectedPreviewDoc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary"
                  >
                    <ArrowSquareOut size={16} weight="bold" />
                    <span>{isTa ? "PDF ஆவணத்தைத் திற" : "Open PDF Document"}</span>
                  </a>
                </div>
              ) : (
                <div className="image-preview-box">
                  <img
                    src={selectedPreviewDoc.url}
                    alt={selectedPreviewDoc.title}
                    className="doc-preview-img"
                  />
                </div>
              )}
            </div>

            <div className="modal-actions-row">
              <a
                href={selectedPreviewDoc.url}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                <ArrowSquareOut size={14} weight="bold" />
                <span>{isTa ? "முழுத் திரையில் பார்" : "View Full Size"}</span>
              </a>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setSelectedPreviewDoc(null)}
              >
                {isTa ? "மூடு" : "Close Preview"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
