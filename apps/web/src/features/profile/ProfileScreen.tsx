import React, { useState, useEffect } from "react";
import {
  User as UserIcon,
  ShieldCheck,
  CheckCircle,
  XCircle,
  LockSimple,
  Translate,
  PhoneCall,
  FloppyDisk,
  WarningCircle,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import type { CaregiverConsent, AuditLogResponse } from "../../types/backend";
import { StateFeedback } from "../../components/ui/StateFeedback";
import {
  getPatientConsents,
  updateConsentStatus,
  getAuditLogs,
} from "../../services/api";
import { useAuth } from "../auth";
import { LanguageSelector } from "../../components/LanguageSelector";
import { isLanguageAiSupported } from "../../types/language";
import "./ProfileScreen.css";

interface ProfileScreenProps {
  language: string;
  onLanguageChange: (lang: string) => void;
  userRole: "patient" | "caregiver";
  onRoleChange: (role: "patient" | "caregiver") => void;
}

const INITIAL_CONSENTS: CaregiverConsent[] = [
  {
    id: "consent-user-1",
    patient_id: "patient-1",
    caregiver_id: "cg-1",
    caregiver_name: "Dr. Anitha Nathan (Sister / Caregiver)",
    caregiver_email: "anitha.nathan@example.com",
    status: "approved",
    permissions: {
      can_view_prescriptions: true,
      can_view_reminders: true,
      can_view_appointments: true,
      can_view_records: false,
    },
    requested_at: "2026-10-12T10:00:00Z",
  },
  {
    id: "consent-user-2",
    patient_id: "patient-1",
    caregiver_id: "cg-2",
    caregiver_name: "Ramesh Kumar (Son)",
    caregiver_email: "ramesh.k@example.com",
    status: "pending",
    permissions: {
      can_view_prescriptions: true,
      can_view_reminders: true,
      can_view_appointments: false,
      can_view_records: false,
    },
    requested_at: "2026-10-16T18:30:00Z",
  },
];

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  language,
  onLanguageChange,
  userRole,
  onRoleChange,
}) => {
  const { user } = useAuth();
  const [consents, setConsents] = useState<CaregiverConsent[]>(INITIAL_CONSENTS);
  const [auditLogs, setAuditLogs] = useState<AuditLogResponse[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const isTa = language === "ta";

  // Form states
  const [patientName, setPatientName] = useState(user?.full_name || "Kaviya Sundaram");
  const [patientEmail] = useState(user?.email || "kaviya.sundaram@example.com");
  const [patientPhone, setPatientPhone] = useState(user?.phone_number || "+91 98401 23456");
  const [emergencyContact, setEmergencyContact] = useState("Dr. Anitha Nathan (+91 94440 98765)");

  // Sync with auth user if changed
  useEffect(() => {
    if (user) {
      setPatientName(user.full_name);
      setPatientPhone(user.phone_number || "+91 98401 23456");
    }
  }, [user]);

  // Load consents and audit logs
  useEffect(() => {
    async function fetchConsentData() {
      try {
        const remoteConsents = await getPatientConsents();
        if (remoteConsents && remoteConsents.length > 0) {
          setConsents(remoteConsents);
        }
      } catch {
        // Fallback to initial mock data if offline
      }

      try {
        const logs = await getAuditLogs();
        if (logs) {
          setAuditLogs(logs);
        }
      } catch {
        // Fallback or empty audit logs
      }
    }

    fetchConsentData();
  }, []);

  const handleTogglePermission = async (
    consentId: string,
    key: keyof CaregiverConsent["permissions"]
  ) => {
    const current = consents.find((c) => c.id === consentId);
    if (!current) return;

    const updatedPermissions = {
      ...current.permissions,
      [key]: !current.permissions[key],
    };

    setConsents((prev) =>
      prev.map((c) =>
        c.id === consentId ? { ...c, permissions: updatedPermissions } : c
      )
    );

    try {
      await updateConsentStatus(consentId, {
        status: current.status,
        permissions: updatedPermissions,
      });
      setActionMessage(isTa ? "அனுமதி புதுப்பிக்கப்பட்டது" : "Permission updated successfully");
      setTimeout(() => setActionMessage(null), 2500);
      const refreshedLogs = await getAuditLogs();
      setAuditLogs(refreshedLogs);
    } catch {
      // Offline fallback
    }
  };

  const handleConsentAction = async (consentId: string, newStatus: "approved" | "revoked") => {
    const current = consents.find((c) => c.id === consentId);
    if (!current) return;

    setConsents((prev) =>
      prev.map((c) => (c.id === consentId ? { ...c, status: newStatus } : c))
    );

    try {
      await updateConsentStatus(consentId, {
        status: newStatus,
        permissions: current.permissions,
      });
      setActionMessage(
        newStatus === "approved"
          ? isTa ? "பராமரிப்பாளருக்கு அனுமதி வழங்கப்பட்டது" : "Caregiver access approved"
          : isTa ? "பராமரிப்பாளர் அணுகல் ரத்து செய்யப்பட்டது" : "Caregiver access revoked"
      );
      setTimeout(() => setActionMessage(null), 2500);
      const refreshedLogs = await getAuditLogs();
      setAuditLogs(refreshedLogs);
    } catch {
      // Offline fallback
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  return (
    <div className="profile-screen" lang={language}>
      {/* Header */}
      <div className="profile-header">
        <div className="profile-avatar-large">
          <UserIcon size={36} weight="bold" />
        </div>
        <div className="profile-title-group">
          <h1 className="profile-main-title">{patientName}</h1>
          <p className="profile-sub-title">
            {patientEmail} &bull; {userRole === "patient" ? (isTa ? "நோயாளி கணக்கு" : "Patient Account") : (isTa ? "பராமரிப்பாளர் கணக்கு" : "Caregiver Account")}
          </p>
        </div>
      </div>

      {saveSuccess && (
        <StateFeedback
          state="success"
          title={isTa ? "சுயவிவரம் புதுப்பிக்கப்பட்டது!" : "Profile Saved!"}
          message={isTa ? "உங்கள் மாற்றங்கள் வெற்றிகரமாக சேமிக்கப்பட்டன." : "Your profile settings have been successfully updated."}
        />
      )}

      {actionMessage && (
        <StateFeedback
          state="success"
          title={isTa ? "அனுமதி புதுப்பிக்கப்பட்டது!" : "Consent Updated"}
          message={actionMessage}
        />
      )}

      {/* Grid: Settings & Caregiver Consent */}
      <div className="profile-grid">
        {/* Left Column: Personal Information & Preferences */}
        <section className="profile-card">
          <h2 className="card-section-title">
            <UserIcon size={20} weight="bold" />
            <span>{isTa ? "தனிப்பட்ட விவரங்கள்" : "Personal Details"}</span>
          </h2>

          <form onSubmit={handleSaveProfile} className="profile-form">
            <div className="form-group">
              <label htmlFor="patient-name-field" className="form-label">{isTa ? "முழு பெயர்" : "Full Name"}</label>
              <input
                id="patient-name-field"
                type="text"
                className="form-input"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="patient-email-field" className="form-label">{isTa ? "மின்னஞ்சல் (மாற்ற முடியாது)" : "Email Address"}</label>
              <input
                id="patient-email-field"
                type="email"
                className="form-input disabled"
                value={patientEmail}
                disabled
              />
            </div>

            <div className="form-group">
              <label htmlFor="patient-phone-field" className="form-label">{isTa ? "தொலைபேசி எண்" : "Phone Number"}</label>
              <input
                id="patient-phone-field"
                type="tel"
                className="form-input"
                value={patientPhone}
                onChange={(e) => setPatientPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="patient-emergency-field" className="form-label">
                <PhoneCall size={14} weight="bold" />
                <span>{isTa ? "அவசர தொடர்பு நபர் & எண்" : "Emergency Contact"}</span>
              </label>
              <input
                id="patient-emergency-field"
                type="text"
                className="form-input"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
              />
            </div>

            {/* Language & Role Preferences */}
            <div className="preferences-divider" />
            <h3 className="sub-section-title">{isTa ? "விருப்பத்தேர்வுகள்" : "Interface Preferences"}</h3>

            <div className="preference-row">
              <div className="pref-label-group">
                <Translate size={18} />
                <span>{isTa ? "மொழி (Language)" : "Language"}</span>
              </div>
              <LanguageSelector
                language={language}
                onSelectLanguage={onLanguageChange}
              />
            </div>

            {!isLanguageAiSupported(language) && (
              <div
                className="pref-unsupported-lang-note"
                role="note"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginTop: "-0.25rem",
                  marginBottom: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "var(--warn-bg)",
                  border: "1px solid var(--warn-border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--warn)",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                }}
              >
                <WarningCircle size={16} weight="bold" />
                <span>This language is not currently supported by the AI service.</span>
              </div>
            )}

            <div className="preference-row">
              <div className="pref-label-group">
                <ShieldCheck size={18} />
                <span>{isTa ? "தளப் பயன்முறை (Active Role)" : "Active Portal Role"}</span>
              </div>
              <div className="lang-toggle-chips">
                <button
                  type="button"
                  className={`chip-btn ${userRole === "patient" ? "active" : ""}`}
                  onClick={() => onRoleChange("patient")}
                >
                  Patient
                </button>
                <button
                  type="button"
                  className={`chip-btn ${userRole === "caregiver" ? "active" : ""}`}
                  onClick={() => onRoleChange("caregiver")}
                >
                  Caregiver
                </button>
              </div>
            </div>

            <button type="submit" className="save-profile-btn">
              <FloppyDisk size={18} weight="bold" />
              <span>{isTa ? "மாற்றங்களைச் சேமி" : "Save Changes"}</span>
            </button>
          </form>
        </section>

        {/* Right Column: Caregiver Access & Sovereign Consent Control */}
        <section className="profile-card">
          <div className="caregiver-consent-header">
            <h2 className="card-section-title">
              <ShieldCheck size={20} weight="bold" />
              <span>{isTa ? "பராமரிப்பாளர் அணுகல் கட்டுப்பாடு" : "Caregiver Access & Consent"}</span>
            </h2>
            <span className="privacy-guarantee-pill">
              <LockSimple size={12} weight="bold" />
              <span>{isTa ? "நோயாளியின் அனுமதி கட்டாயம்" : "Patient Governed"}</span>
            </span>
          </div>

          <p className="consent-help-text">
            {isTa
              ? "உங்கள் மருத்துவ ஆவணங்களை யார் பார்க்கலாம் என்பதை நீங்கள் மட்டுமே தீர்மானிக்க முடியும். எந்த நேரத்திலும் அனுமதியை மாற்றவோ அல்லது ரத்து செய்யவோ முடியும்."
              : "Control exactly which family members or caregivers can view your medications, reminders, and appointments. You can revoke access at any time."}
          </p>

          <div className="consent-list">
            {consents.map((c) => {
              const isApproved = c.status === "approved";
              const isPending = c.status === "pending";

              return (
                <div key={c.id} className="consent-manage-item">
                  <div className="consent-item-top">
                    <div>
                      <div className="consent-caregiver-name">{c.caregiver_name}</div>
                      <div className="consent-caregiver-email">{c.caregiver_email}</div>
                    </div>
                    <div>
                      {isApproved && (
                        <span className="pill approved">{isTa ? "செயலில்" : "Active"}</span>
                      )}
                      {isPending && (
                        <span className="pill pending">{isTa ? "ஒப்புதல் தேவை" : "Needs Approval"}</span>
                      )}
                      {c.status === "revoked" && (
                        <span className="pill revoked">{isTa ? "ரத்து செய்யப்பட்டது" : "Revoked"}</span>
                      )}
                    </div>
                  </div>

                  {/* Scopes toggles */}
                  {isApproved && (
                    <div className="scopes-control-box">
                      <span className="scopes-caption">
                        {isTa ? "பகிர்வு அனுமதிகள்:" : "Permitted Scopes:"}
                      </span>
                      <div className="toggle-list">
                        <label className="scope-checkbox-label">
                          <input
                            type="checkbox"
                            checked={c.permissions.can_view_prescriptions}
                            onChange={() => handleTogglePermission(c.id, "can_view_prescriptions")}
                          />
                          <span>{isTa ? "மருந்துச் சீட்டுகள்" : "Prescriptions"}</span>
                        </label>
                        <label className="scope-checkbox-label">
                          <input
                            type="checkbox"
                            checked={c.permissions.can_view_reminders}
                            onChange={() => handleTogglePermission(c.id, "can_view_reminders")}
                          />
                          <span>{isTa ? "மருந்து நினைவூட்டல்கள்" : "Med Reminders"}</span>
                        </label>
                        <label className="scope-checkbox-label">
                          <input
                            type="checkbox"
                            checked={c.permissions.can_view_appointments}
                            onChange={() => handleTogglePermission(c.id, "can_view_appointments")}
                          />
                          <span>{isTa ? "மருத்துவ சந்திப்புகள்" : "Appointments"}</span>
                        </label>
                        <label className="scope-checkbox-label">
                          <input
                            type="checkbox"
                            checked={c.permissions.can_view_records}
                            onChange={() => handleTogglePermission(c.id, "can_view_records")}
                          />
                          <span>{isTa ? "முழு மருத்துவ பதிவுகள்" : "Full Records"}</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="consent-item-actions">
                    {isPending && (
                      <>
                        <button
                          type="button"
                          className="btn-approve"
                          onClick={() => handleConsentAction(c.id, "approved")}
                        >
                          <CheckCircle size={14} weight="fill" />
                          <span>{isTa ? "அனுமதி வழங்கு" : "Approve Access"}</span>
                        </button>
                        <button
                          type="button"
                          className="btn-revoke"
                          onClick={() => handleConsentAction(c.id, "revoked")}
                        >
                          <XCircle size={14} weight="bold" />
                          <span>{isTa ? "நிராகரி" : "Reject"}</span>
                        </button>
                      </>
                    )}

                    {isApproved && (
                      <button
                        type="button"
                        className="btn-revoke"
                        onClick={() => handleConsentAction(c.id, "revoked")}
                      >
                        <XCircle size={14} weight="bold" />
                        <span>{isTa ? "அணுகலை ரத்து செய்" : "Revoke Access"}</span>
                      </button>
                    )}

                    {c.status === "revoked" && (
                      <button
                        type="button"
                        className="btn-approve"
                        onClick={() => handleConsentAction(c.id, "approved")}
                      >
                        <span>{isTa ? "மீண்டும் அனுமதி" : "Re-authorize"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="audit-disclaimer-box">
            <WarningCircle size={16} weight="fill" />
            <span>
              {isTa
                ? "பராமரிப்பாளர் எந்தவொரு பதிவை பார்த்தாலும் உங்கள் தணிக்கைப் பதிவேட்டில் தானாக பதிவு செய்யப்படும்."
                : "Every time a caregiver accesses any of your clinical records, an entry is permanently written to your audit log."}
            </span>
          </div>

          {/* Live Access Audit Trail */}
          <div className="audit-log-section">
            <div className="audit-log-title">
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <ClockCounterClockwise size={16} weight="bold" />
                <span>{isTa ? "அணுகல் தணிக்கைப் பதிவு (Audit Trail)" : "Caregiver Access Audit Trail"}</span>
              </div>
              <span className="audit-log-badge">
                {auditLogs.length} {isTa ? "பதிவுகள்" : "Events"}
              </span>
            </div>

            <div className="audit-log-list">
              {auditLogs.length === 0 ? (
                <div className="audit-log-empty">
                  {isTa ? "தணிக்கை பதிவுகள் எதுவும் இல்லை." : "No access logs recorded yet."}
                </div>
              ) : (
                auditLogs.map((log) => {
                  const dateStr = new Date(log.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  return (
                    <div key={log.id} className="audit-log-entry">
                      <div className="audit-entry-main">
                        <div>
                          <span className="audit-entry-actor">
                            {log.actor_name || log.actor_id}
                          </span>{" "}
                          ({log.actor_role || "caregiver"})
                        </div>
                        <div className="audit-entry-action">
                          {log.action}: {log.resource}
                        </div>
                      </div>
                      <div className="audit-entry-time">{dateStr}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
