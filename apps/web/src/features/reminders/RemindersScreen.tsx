import React, { useState } from "react";
import {
  Pill,
  CheckCircle,
  XCircle,
  WarningCircle,
  Clock,
  PlusCircle,
  ShieldCheck,
  Flask,
} from "@phosphor-icons/react";
import type { MedicineReminder } from "../../types/backend";
import "./RemindersScreen.css";

interface RemindersScreenProps {
  language: "en" | "ta";
  onAddFromPrescription?: () => void;
}

const INITIAL_REMINDERS: MedicineReminder[] = [
  {
    id: "rem-1",
    patient_id: "patient-1",
    medicine_name: "Metformin Hydrochloride",
    dosage: "500 mg",
    instructions: "Take with food morning and night",
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
    patient_id: "patient-1",
    medicine_name: "Atorvastatin Calcium",
    dosage: "20 mg",
    instructions: "Take once daily in the evening after dinner",
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
    patient_id: "patient-1",
    medicine_name: "Telmisartan",
    dosage: "40 mg",
    instructions: "Take once daily in the morning",
    times_per_day: 1,
    slots: ["morning"],
    total_supply: 30,
    remaining_supply: 25,
    refill_threshold: 7,
    is_verified_rx: true,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const RemindersScreen: React.FC<RemindersScreenProps> = ({
  language,
  onAddFromPrescription,
}) => {
  const [reminders, setReminders] = useState<MedicineReminder[]>(INITIAL_REMINDERS);
  const [doseStatusMap, setDoseStatusMap] = useState<Record<string, "taken" | "missed">>({
    "rem-1-morning": "taken",
    "rem-3-morning": "taken",
  });
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isTa = language === "ta";

  const handleMarkDose = (reminderId: string, slot: string, status: "taken" | "missed") => {
    const key = `${reminderId}-${slot}`;
    setDoseStatusMap((prev) => ({ ...prev, [key]: status }));

    // If taken, decrement remaining supply
    if (status === "taken") {
      setReminders((prev) =>
        prev.map((r) =>
          r.id === reminderId && r.remaining_supply && r.remaining_supply > 0
            ? { ...r, remaining_supply: r.remaining_supply - 1 }
            : r
        )
      );
      setActionNotice(isTa ? "மருந்து எடுக்கப்பட்டதாக குறிக்கப்பட்டது." : "Dose recorded as taken.");
    } else {
      setActionNotice(isTa ? "மருந்து தவறவிடப்பட்டதாக குறிக்கப்பட்டது." : "Dose marked as missed.");
    }

    setTimeout(() => setActionNotice(null), 2500);
  };

  const lowSupplyMedicines = reminders.filter(
    (r) => r.remaining_supply && r.refill_threshold && r.remaining_supply <= r.refill_threshold
  );

  return (
    <div className="reminders-screen" lang={language}>
      {/* Top Banner */}
      <div className="reminders-header-banner">
        <div>
          <div className="badge-pill">
            <Pill size={16} weight="fill" />
            <span>{isTa ? "மருந்து நினைவூட்டல் அட்டவணை" : "Medication Adherence & Refill Portal"}</span>
          </div>
          <h1 className="reminders-title">
            {isTa ? "இன்றைய மருந்து அட்டவணை" : "Daily Medication Reminders"}
          </h1>
          <p className="reminders-sub">
            {isTa
              ? "சரிபார்க்கப்பட்ட மருந்துச் சீட்டின் அடிப்படையில் வேளை மருந்துகளைக் கண்காணிக்கவும்."
              : "Track doses on schedule and monitor your remaining supply to avoid missing refills."}
          </p>
        </div>

        <div className="banner-side">
          <div className="synthetic-badge-pill">
            <Flask size={14} weight="bold" />
            <span>{isTa ? "மாதிரி அட்டவணை" : "Synthetic Sample Schedule"}</span>
          </div>
          {onAddFromPrescription && (
            <button type="button" className="add-rx-shortcut-btn" onClick={onAddFromPrescription}>
              <PlusCircle size={18} weight="bold" />
              <span>{isTa ? "மருந்துச் சீட்டைப் பதிவேற்று" : "Upload Prescription"}</span>
            </button>
          )}
        </div>
      </div>

      {actionNotice && (
        <div className="reminder-toast" role="status">
          <CheckCircle size={18} weight="fill" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Refill Alert Warning Banner */}
      {lowSupplyMedicines.length > 0 && (
        <div className="refill-alert-banner">
          <WarningCircle size={22} weight="fill" className="alert-icon" />
          <div className="alert-text">
            <h4 className="alert-title">
              {isTa ? "மறு நிரப்பல் தேவைப்படும் மருந்துகள் (Low Supply Warning)" : "Refill Needed Soon"}
            </h4>
            <p className="alert-desc">
              {lowSupplyMedicines.map((m) => `${m.medicine_name} (${m.remaining_supply} ${isTa ? "நாட்கள் மீதம்" : "doses left"}`).join(", ")}.
              {" "}{isTa ? "மருந்தகத்தைத் தொடர்பு கொண்டு முன்கூட்டியே ஆர்டர் செய்யவும்." : "Please order from your pharmacy to prevent therapy interruptions."}
            </p>
          </div>
        </div>
      )}

      {/* Active Medication Reminders Grid */}
      <div className="reminders-grid">
        {reminders.map((med) => {
          const isLow = med.remaining_supply && med.refill_threshold && med.remaining_supply <= med.refill_threshold;

          return (
            <div key={med.id} className="med-reminder-card">
              <div className="card-top-row">
                <div className="med-title-block">
                  <div className="med-name-badge-row">
                    <h3 className="med-name">{med.medicine_name}</h3>
                    {med.is_verified_rx && (
                      <span className="rx-verified-badge" title="Verified against clinical prescription">
                        <ShieldCheck size={12} weight="fill" />
                        <span>{isTa ? "பரிந்துரைக்கப்பட்டது" : "Verified Rx"}</span>
                      </span>
                    )}
                  </div>
                  <span className="med-dose-text">{med.dosage}</span>
                </div>

                <div className={`supply-pill ${isLow ? "low" : "ok"}`}>
                  <span>{med.remaining_supply} {isTa ? "மீதம்" : "remaining"}</span>
                </div>
              </div>

              {med.instructions && (
                <p className="med-instructions">{med.instructions}</p>
              )}

              {/* Slots and Dose Mark Action */}
              <div className="slots-action-section">
                <span className="slots-label">{isTa ? "இன்றைய வேளைகள்:" : "Scheduled Slots:"}</span>
                <div className="slot-buttons-row">
                  {med.slots.map((slot) => {
                    const statusKey = `${med.id}-${slot}`;
                    const currentStatus = doseStatusMap[statusKey];

                    return (
                      <div key={slot} className="slot-pill-group">
                        <span className="slot-name-tag">
                          <Clock size={12} />
                          <span>{slot}</span>
                        </span>

                        {currentStatus === "taken" ? (
                          <span className="dose-status-chip taken">
                            <CheckCircle size={14} weight="fill" />
                            <span>{isTa ? "எடுக்கப்பட்டது" : "Taken"}</span>
                          </span>
                        ) : currentStatus === "missed" ? (
                          <span className="dose-status-chip missed">
                            <XCircle size={14} weight="fill" />
                            <span>{isTa ? "தவறவிடப்பட்டது" : "Missed"}</span>
                          </span>
                        ) : (
                          <div className="action-buttons-pair">
                            <button
                              type="button"
                              className="btn-take"
                              onClick={() => handleMarkDose(med.id, slot, "taken")}
                            >
                              <CheckCircle size={14} weight="bold" />
                              <span>{isTa ? "எடுத்தேன்" : "Take"}</span>
                            </button>
                            <button
                              type="button"
                              className="btn-miss"
                              onClick={() => handleMarkDose(med.id, slot, "missed")}
                            >
                              <span>{isTa ? "தவிர்" : "Miss"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
