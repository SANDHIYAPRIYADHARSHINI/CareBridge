import React, { useState } from "react";
import {
  UsersThree,
  UserCheck,
  ShieldCheck,
  PlusCircle,
  Clock,
  WarningCircle,
  CheckCircle,
  XCircle,
  LockSimple,
  Flask,
} from "@phosphor-icons/react";
import type { CaregiverConsent } from "../../types/backend";
import { StateFeedback, type FeedbackState } from "../../components/ui/StateFeedback";
import "./CaregiverDashboard.css";

interface CaregiverDashboardProps {
  language: "en" | "ta";
  onViewPatientTimeline?: (patientId: string) => void;
}

const DEMO_CONSENTS: CaregiverConsent[] = [
  {
    id: "consent-1",
    patient_id: "patient-demo-1",
    caregiver_id: "cg-1",
    caregiver_name: "Kaviya (Mother)",
    caregiver_email: "kaviya.parent@example.com",
    status: "approved",
    permissions: {
      can_view_prescriptions: true,
      can_view_reminders: true,
      can_view_appointments: true,
      can_view_records: false, // Explicitly restricted
    },
    requested_at: "2026-10-10T09:00:00Z",
    responded_at: "2026-10-10T09:30:00Z",
  },
  {
    id: "consent-2",
    patient_id: "patient-demo-2",
    caregiver_id: "cg-1",
    caregiver_name: "Sundar Rajan (Uncle)",
    caregiver_email: "sundar.r@example.com",
    status: "pending",
    permissions: {
      can_view_prescriptions: true,
      can_view_reminders: true,
      can_view_appointments: false,
      can_view_records: false,
    },
    requested_at: "2026-10-15T14:20:00Z",
  },
];

export const CaregiverDashboard: React.FC<CaregiverDashboardProps> = ({
  language,
}) => {
  const [consents] = useState<CaregiverConsent[]>(DEMO_CONSENTS);
  const [feedbackState] = useState<FeedbackState>("success");
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [patientEmailInput, setPatientEmailInput] = useState("");
  const [requestSuccess, setRequestSuccess] = useState(false);

  const isTa = language === "ta";

  const handleSendRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientEmailInput.trim()) return;
    setRequestSuccess(true);
    setTimeout(() => {
      setIsRequestModalOpen(false);
      setRequestSuccess(false);
      setPatientEmailInput("");
    }, 1500);
  };

  if (feedbackState === "loading") {
    return (
      <StateFeedback
        state="loading"
        title={isTa ? "பராமரிப்பாளர் தளம் ஏற்றப்படுகிறது..." : "Loading Caregiver Portal..."}
        message={isTa ? "அனுமதி பெற்ற நோயாளி விவரங்கள் பெறப்படுகின்றன." : "Fetching authorized patient records."}
      />
    );
  }

  return (
    <div className="caregiver-dashboard" lang={language}>
      {/* Header Banner */}
      <div className="caregiver-banner">
        <div className="banner-left">
          <div className="caregiver-badge">
            <UsersThree size={16} weight="fill" />
            <span>{isTa ? "பராமரிப்பாளர் தளம் (Caregiver Mode)" : "Caregiver Portal"}</span>
          </div>
          <h1 className="caregiver-title">
            {isTa ? "அங்கீகரிக்கப்பட்ட குடும்ப நல மேற்பார்வை" : "Authorized Family Care Oversight"}
          </h1>
          <p className="caregiver-subtitle">
            {isTa
              ? "நோயாளியால் அனுமதிக்கப்பட்ட மருந்து அட்டவணை மற்றும் மருத்துவ பதிவுகளை மட்டும் பார்க்க முடியும்."
              : "Review medication adherence and clinical schedules for family members who have explicitly approved sharing."}
          </p>
        </div>

        <div className="banner-actions">
          <div className="synthetic-badge-pill" title="Synthetic Consent Records">
            <Flask size={14} weight="bold" />
            <span>{isTa ? "மாதிரி அனுமதி பதிவுகள்" : "Synthetic Consent Data"}</span>
          </div>
          <button
            type="button"
            className="request-access-btn"
            onClick={() => setIsRequestModalOpen(true)}
          >
            <PlusCircle size={18} weight="bold" />
            <span>{isTa ? "புதிய அணுகல் கோரிக்கை" : "Request Patient Access"}</span>
          </button>
        </div>
      </div>

      {/* Patient Consent Cards List */}
      <section className="consents-section">
        <div className="section-header-row">
          <h2 className="section-title">
            {isTa ? "இணைக்கப்பட்ட நோயாளிகள்" : "Linked Patients & Consent Status"}
          </h2>
          <span className="count-chip">{consents.length} {isTa ? "நபர்கள்" : "Profiles"}</span>
        </div>

        <div className="consent-cards-grid">
          {consents.map((consent) => {
            const isApproved = consent.status === "approved";
            const isPending = consent.status === "pending";

            return (
              <div key={consent.id} className={`consent-card ${consent.status}`}>
                <div className="consent-card-header">
                  <div className="patient-avatar-box">
                    <UserCheck size={24} weight="bold" />
                  </div>
                  <div className="patient-meta">
                    <h3 className="patient-name">{consent.caregiver_name || "Patient Profile"}</h3>
                    <span className="patient-email">{consent.caregiver_email}</span>
                  </div>
                  <div className="status-badge-container">
                    {isApproved && (
                      <span className="status-badge approved">
                        <CheckCircle size={14} weight="fill" />
                        <span>{isTa ? "அனுமதிக்கப்பட்டது" : "Approved"}</span>
                      </span>
                    )}
                    {isPending && (
                      <span className="status-badge pending">
                        <Clock size={14} weight="fill" />
                        <span>{isTa ? "ஒப்புதல் நிலுவையில்" : "Pending Approval"}</span>
                      </span>
                    )}
                    {consent.status === "revoked" && (
                      <span className="status-badge revoked">
                        <XCircle size={14} weight="fill" />
                        <span>{isTa ? "ரத்து செய்யப்பட்டது" : "Revoked"}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Granular Permissions Matrix */}
                <div className="permissions-matrix">
                  <span className="matrix-title">
                    {isTa ? "அனுமதி எல்லைகள் (Consent Scopes):" : "Authorized Permission Scopes:"}
                  </span>
                  <div className="permissions-pills-row">
                    <span className={`perm-pill ${consent.permissions.can_view_prescriptions ? "granted" : "restricted"}`}>
                      {consent.permissions.can_view_prescriptions ? (
                        <CheckCircle size={12} weight="fill" />
                      ) : (
                        <LockSimple size={12} weight="bold" />
                      )}
                      <span>{isTa ? "மருந்துச் சீட்டுகள்" : "Prescriptions"}</span>
                    </span>

                    <span className={`perm-pill ${consent.permissions.can_view_reminders ? "granted" : "restricted"}`}>
                      {consent.permissions.can_view_reminders ? (
                        <CheckCircle size={12} weight="fill" />
                      ) : (
                        <LockSimple size={12} weight="bold" />
                      )}
                      <span>{isTa ? "நினைவூட்டல்கள்" : "Reminders"}</span>
                    </span>

                    <span className={`perm-pill ${consent.permissions.can_view_appointments ? "granted" : "restricted"}`}>
                      {consent.permissions.can_view_appointments ? (
                        <CheckCircle size={12} weight="fill" />
                      ) : (
                        <LockSimple size={12} weight="bold" />
                      )}
                      <span>{isTa ? "சந்திப்புகள்" : "Appointments"}</span>
                    </span>

                    <span className={`perm-pill ${consent.permissions.can_view_records ? "granted" : "restricted"}`}>
                      {consent.permissions.can_view_records ? (
                        <CheckCircle size={12} weight="fill" />
                      ) : (
                        <LockSimple size={12} weight="bold" />
                      )}
                      <span>{isTa ? "மருத்துவ பதிவுகள்" : "Full Records"}</span>
                    </span>
                  </div>
                </div>

                {/* Patient Summary & Restrict Notice */}
                <div className="consent-card-footer">
                  {isApproved ? (
                    <div className="permitted-summary">
                      <div className="summary-pill ok">
                        <CheckCircle size={14} weight="fill" />
                        <span>{isTa ? "இன்றைய மருந்துகள்: 2/2 எடுக்கப்பட்டது" : "Today: 2/2 doses recorded taken"}</span>
                      </div>
                      {!consent.permissions.can_view_records && (
                        <div className="restricted-notice">
                          <LockSimple size={12} weight="bold" />
                          <span>{isTa ? "முழு மருத்துவ பதிவுகளுக்கான அணுகல் முடக்கப்பட்டுள்ளது" : "Full medical records restricted by patient"}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pending-explanation">
                      <WarningCircle size={14} weight="fill" />
                      <span>
                        {isTa
                          ? "நோயாளி தனது தளத்தில் கோரிக்கையை ஏற்கும் வரை பதிவுகள் பூட்டப்பட்டிருக்கும்."
                          : "Health data remains locked until the patient reviews and authorizes your request."}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Safety and Consent Policy Notice */}
      <div className="caregiver-privacy-card">
        <ShieldCheck size={24} weight="fill" className="shield-icon" />
        <div className="policy-text">
          <h4 className="policy-title">{isTa ? "தனியுரிமை மற்றும் நோயாளி ஒப்புதல் விதிமுறை" : "Zero-Trust Consent Enforcement"}</h4>
          <p className="policy-desc">
            {isTa
              ? "நோயாளி எந்த நேரத்திலும் பராமரிப்பாளர் அணுகலை மாற்றவோ அல்லது உடனடியாக ரத்து செய்யவோ முழு உரிமை கொண்டுள்ளார். அனைத்து அணுகல்களும் தணிக்கைப் பதிவேட்டில் (Audit Log) பாதுகாக்கப்படுகிறது."
              : "Patients retain sovereign control over their clinical records and can revoke caregiver permissions at any moment. Every view of sensitive health records is cryptographically audited on the backend."}
          </p>
        </div>
      </div>

      {/* Request Access Modal */}
      {isRequestModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsRequestModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{isTa ? "நோயாளி அணுகல் கோருதல்" : "Request Patient Access"}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsRequestModalOpen(false)}
              >
                &times;
              </button>
            </div>

            {requestSuccess ? (
              <StateFeedback
                state="success"
                title={isTa ? "கோரிக்கை அனுப்பப்பட்டது!" : "Access Request Sent!"}
                message={isTa ? "நோயாளி ஒப்புதலுக்காக காத்திருக்கவும்." : "A notification was dispatched to the patient for review."}
              />
            ) : (
              <form onSubmit={handleSendRequest} className="request-form">
                <p className="form-help">
                  {isTa
                    ? "நீங்கள் பராமரிக்க விரும்பும் குடும்ப உறுப்பினரின் பதிவு செய்யப்பட்ட மின்னஞ்சல் முகவரியை உள்ளிடவும்."
                    : "Enter the registered email of the patient. They must approve your request in their CareBridge dashboard."}
                </p>

                <div className="form-group">
                  <label htmlFor="patient-email-input" className="form-label">
                    {isTa ? "நோயாளியின் மின்னஞ்சல்" : "Patient Email Address"}
                  </label>
                  <input
                    id="patient-email-input"
                    type="email"
                    required
                    placeholder="patient@example.com"
                    value={patientEmailInput}
                    onChange={(e) => setPatientEmailInput(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-permissions-preview">
                  <span className="preview-label">{isTa ? "கோரப்படும் அனுமதிகள்:" : "Requested Scopes:"}</span>
                  <ul>
                    <li>{isTa ? "மருந்துச் சீட்டுகள் & பரிந்துரைகள்" : "Prescriptions & Dosage"}</li>
                    <li>{isTa ? "மருந்து நினைவூட்டல் அட்டவணை" : "Daily Medication Reminders"}</li>
                    <li>{isTa ? "மருத்துவ சந்திப்பு நினைவூட்டல்கள்" : "Upcoming Doctor Appointments"}</li>
                  </ul>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setIsRequestModalOpen(false)}
                  >
                    {isTa ? "ரத்து செய்" : "Cancel"}
                  </button>
                  <button type="submit" className="modal-submit-btn">
                    {isTa ? "கோரிக்கையை அனுப்பு" : "Send Access Request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
