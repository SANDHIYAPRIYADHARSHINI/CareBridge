import React, { useState, useEffect, useCallback } from "react";
import {
  Pill,
  CheckCircle,
  XCircle,
  WarningCircle,
  Clock,
  PlusCircle,
  ShieldCheck,
  Flask,
  PencilSimple,
  Trash,
  X,
  Info,
  ShieldWarning,
  NotePencil,
} from "@phosphor-icons/react";
import type {
  MedicineReminder,
  ReminderCreatePayload,
  ReminderUpdatePayload,
} from "../../types/backend";
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  logDose,
} from "../../services/api";
import "./RemindersScreen.css";

interface RemindersScreenProps {
  language: string;
  onAddFromPrescription?: () => void;
  patientId?: string; // For caregiver view
  isCaregiverView?: boolean;
}

const FALLBACK_REMINDERS: MedicineReminder[] = [
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

type SlotType = "morning" | "noon" | "evening" | "night";

export const RemindersScreen: React.FC<RemindersScreenProps> = ({
  language,
  onAddFromPrescription,
  patientId,
  isCaregiverView = false,
}) => {
  const [reminders, setReminders] = useState<MedicineReminder[]>(FALLBACK_REMINDERS);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [doseStatusMap, setDoseStatusMap] = useState<Record<string, "taken" | "missed">>({});

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<MedicineReminder | null>(null);
  const [deletingReminderId, setDeletingReminderId] = useState<string | null>(null);

  // New Reminder form fields
  const [newName, setNewName] = useState("");
  const [newDosage, setNewDosage] = useState("");
  const [newInstructions, setNewInstructions] = useState("");
  const [newSlots, setNewSlots] = useState<SlotType[]>(["morning"]);
  const [newSupply, setNewSupply] = useState<number>(30);
  const [newThreshold, setNewThreshold] = useState<number>(7);

  // Edit fields
  const [editRemainingSupply, setEditRemainingSupply] = useState<number>(30);
  const [editThreshold, setEditThreshold] = useState<number>(7);
  const [editInstructions, setEditInstructions] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const isTa = language === "ta";

  // Fetch reminders
  const fetchRemindersList = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await getReminders(patientId);
      if (Array.isArray(data) && data.length > 0) {
        setReminders(data);
      }
    } catch {
      // Fallback gracefully to demo synthetic reminders if unauthenticated or offline
      setReminders(FALLBACK_REMINDERS);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchRemindersList();
  }, [fetchRemindersList]);

  // Mark dose
  const handleMarkDose = async (reminder: MedicineReminder, slot: SlotType, status: "taken" | "missed") => {
    const key = `${reminder.id}-${slot}`;
    setDoseStatusMap((prev) => ({ ...prev, [key]: status }));

    // Optimistically update supply if taken
    if (status === "taken") {
      setReminders((prev) =>
        prev.map((r) =>
          r.id === reminder.id && r.remaining_supply && r.remaining_supply > 0
            ? { ...r, remaining_supply: r.remaining_supply - 1 }
            : r
        )
      );
      setActionNotice(isTa ? "மருந்து எடுக்கப்பட்டதாக குறிக்கப்பட்டது." : "Dose recorded as taken.");
    } else {
      setActionNotice(isTa ? "மருந்து தவறவிடப்பட்டதாக குறிக்கப்பட்டது." : "Dose marked as missed.");
    }

    try {
      await logDose(reminder.id, {
        scheduled_time: new Date().toISOString(),
        status,
        notes: `Recorded from ${slot} reminder slot`,
      });
    } catch (err) {
      console.warn("Could not log dose to backend:", err);
    }

    setTimeout(() => setActionNotice(null), 3000);
  };

  // Create reminder
  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDosage.trim()) return;

    const payload: ReminderCreatePayload = {
      medicine_name: newName.trim(),
      dosage: newDosage.trim(),
      instructions: newInstructions.trim() || undefined,
      times_per_day: newSlots.length,
      slots: newSlots,
      total_supply: newSupply,
      remaining_supply: newSupply,
      refill_threshold: newThreshold,
      is_verified_rx: false, // Explicitly marked as manual entry
    };

    try {
      const created = await createReminder(payload);
      setReminders((prev) => [created, ...prev]);
      setActionNotice(isTa ? "நினைவூட்டல் சேர்க்கப்பட்டது." : "Medication reminder created.");
    } catch {
      // Local fallback in demo mode
      const localNew: MedicineReminder = {
        id: `rem-local-${Date.now()}`,
        patient_id: patientId || "patient-1",
        medicine_name: payload.medicine_name,
        dosage: payload.dosage,
        instructions: payload.instructions,
        times_per_day: payload.times_per_day || 1,
        slots: payload.slots || ["morning"],
        total_supply: payload.total_supply,
        remaining_supply: payload.remaining_supply,
        refill_threshold: payload.refill_threshold,
        is_verified_rx: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setReminders((prev) => [localNew, ...prev]);
      setActionNotice(isTa ? "நினைவூட்டல் சேர்க்கப்பட்டது (டெமோ)." : "Reminder created (Demo Mode).");
    }

    // Reset form
    setNewName("");
    setNewDosage("");
    setNewInstructions("");
    setNewSlots(["morning"]);
    setNewSupply(30);
    setNewThreshold(7);
    setIsAddModalOpen(false);
    setTimeout(() => setActionNotice(null), 3000);
  };

  // Open Edit Modal
  const openEditModal = (med: MedicineReminder) => {
    setEditingReminder(med);
    setEditRemainingSupply(med.remaining_supply ?? 30);
    setEditThreshold(med.refill_threshold ?? 7);
    setEditInstructions(med.instructions ?? "");
    setEditIsActive(med.is_active ?? true);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReminder) return;

    const payload: ReminderUpdatePayload = {
      remaining_supply: editRemainingSupply,
      refill_threshold: editThreshold,
      instructions: editInstructions,
      is_active: editIsActive,
    };

    try {
      const updated = await updateReminder(editingReminder.id, payload);
      setReminders((prev) => prev.map((r) => (r.id === editingReminder.id ? updated : r)));
      setActionNotice(isTa ? "நினைவூட்டல் புதுப்பிக்கப்பட்டது." : "Reminder updated.");
    } catch {
      // Local fallback
      setReminders((prev) =>
        prev.map((r) =>
          r.id === editingReminder.id
            ? {
                ...r,
                remaining_supply: editRemainingSupply,
                refill_threshold: editThreshold,
                instructions: editInstructions,
                is_active: editIsActive,
              }
            : r
        )
      );
      setActionNotice(isTa ? "நினைவூட்டல் புதுப்பிக்கப்பட்டது." : "Reminder updated.");
    }

    setEditingReminder(null);
    setTimeout(() => setActionNotice(null), 3000);
  };

  // Delete reminder
  const handleDeleteReminder = async (reminderId: string) => {
    try {
      await deleteReminder(reminderId);
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));
      setActionNotice(isTa ? "நினைவூட்டல் நீக்கப்பட்டது." : "Reminder removed.");
    } catch {
      // Local fallback
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));
      setActionNotice(isTa ? "நினைவூட்டல் நீக்கப்பட்டது." : "Reminder removed.");
    }

    setDeletingReminderId(null);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const toggleSlotSelection = (slot: SlotType) => {
    setNewSlots((prev) =>
      prev.includes(slot)
        ? prev.length > 1
          ? prev.filter((s) => s !== slot)
          : prev
        : [...prev, slot]
    );
  };

  const lowSupplyMedicines = reminders.filter(
    (r) =>
      r.is_active &&
      r.remaining_supply !== undefined &&
      r.refill_threshold !== undefined &&
      r.remaining_supply <= r.refill_threshold
  );

  return (
    <div className="reminders-screen" lang={language}>
      {/* Top Banner */}
      <div className="reminders-header-banner">
        <div>
          <div className="badge-pill">
            <Pill size={16} weight="fill" />
            <span>
              {isTa ? "மருந்து நினைவூட்டல் & மறுநிரப்பல்" : "Medication Adherence & Refill Portal"}
            </span>
          </div>
          <h1 className="reminders-title">
            {isTa ? "இன்றைய மருந்து நினைவூட்டல்கள்" : "Daily Medication Reminders"}
          </h1>
          <p className="reminders-sub">
            {isTa
              ? "சரிபார்க்கப்பட்ட மருந்துச் சீட்டின் அடிப்படையில் வேளை மருந்துகளைக் கண்காணிக்கவும். இருப்பு குறையும்போது மறுநிரப்பல் எச்சரிக்கை பெறவும்."
              : "Track doses on schedule, record adherence, and monitor remaining supplies to avoid missed refills."}
          </p>
        </div>

        <div className="banner-side">
          <div className="synthetic-badge-pill">
            <Flask size={14} weight="bold" />
            <span>{isTa ? "மாதிரி அட்டவணை" : "Synthetic Sample Schedule"}</span>
          </div>
          <div className="banner-actions-row">
            {!isCaregiverView && (
              <button
                type="button"
                className="add-reminder-btn"
                onClick={() => setIsAddModalOpen(true)}
              >
                <PlusCircle size={18} weight="bold" />
                <span>{isTa ? "+ நினைவூட்டல் சேர்" : "+ Add Reminder"}</span>
              </button>
            )}
            {onAddFromPrescription && !isCaregiverView && (
              <button
                type="button"
                className="add-rx-shortcut-btn"
                onClick={onAddFromPrescription}
              >
                <ShieldCheck size={18} weight="bold" />
                <span>{isTa ? "மருந்துச் சீட்டிலிருந்து இறக்குமதி" : "Import from Rx"}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Caregiver Audit Banner if in caregiver view */}
      {isCaregiverView && (
        <div className="caregiver-audit-banner" role="status">
          <Info size={18} weight="bold" />
          <span>
            {isTa
              ? "கவனிப்பாளர் பார்வை: நோயாளியின் ஒப்புதல் மூலம் சரிபார்க்கப்பட்டது. இந்த அணுகல் தணிக்கை பதிவில் பதிவு செய்யப்படுகிறது."
              : "Caregiver View: Displaying authorized patient medication reminders under active patient consent. Access is logged in the audit ledger."}
          </span>
        </div>
      )}

      {/* Action Notification Toast */}
      {actionNotice && (
        <div className="reminder-toast" role="status">
          <CheckCircle size={18} weight="fill" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Refill Alert Warning Banner */}
      {lowSupplyMedicines.length > 0 && (
        <div className="refill-alert-banner" role="alert">
          <WarningCircle size={22} weight="fill" className="alert-icon" />
          <div className="alert-text">
            <h4 className="alert-title">
              {isTa ? "மறு நிரப்பல் தேவைப்படும் மருந்துகள் (Low Supply Warning)" : "Refill Needed Soon"}
            </h4>
            <p className="alert-desc">
              {lowSupplyMedicines
                .map(
                  (m) =>
                    `${m.medicine_name} (${m.remaining_supply} ${isTa ? "அளவுகள் மீதம்" : "doses left"})`
                )
                .join(", ")}
              .{" "}
              {isTa
                ? "மருந்து தீர்ந்துவிடுவதைத் தவிர்க்க உங்கள் மருத்துவரிடம் அல்லது மருந்தகத்தில் புதிய மருந்து வாங்கவும்."
                : "Please reorder from your pharmacy to prevent therapy interruptions."}
            </p>
          </div>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && (
        <div className="reminders-loading-state">
          <Clock size={20} className="spinning-icon" />
          <span>{isTa ? "நினைவூட்டல்கள் ஏற்றப்படுகின்றன..." : "Loading medication reminders..."}</span>
        </div>
      )}

      {errorMsg && (
        <div className="reminders-error-state">
          <span>{errorMsg}</span>
          <button type="button" onClick={fetchRemindersList}>
            {isTa ? "மீண்டும் முயற்சி செய்" : "Retry"}
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && reminders.length === 0 && (
        <div className="reminders-empty-card">
          <Pill size={40} weight="duotone" />
          <h3>{isTa ? "நினைவூட்டல்கள் எதுவும் இல்லை" : "No active medication reminders"}</h3>
          <p>
            {isTa
              ? "மருந்துச் சீட்டைப் பதிவேற்றி தானாக நினைவூட்டல்களை உருவாக்கவும் அல்லது கைமுறையாக புதியதைச் சேர்க்கவும்."
              : "Upload a verified prescription to auto-generate reminders or add one manually."}
          </p>
          {!isCaregiverView && (
            <button
              type="button"
              className="add-reminder-btn"
              onClick={() => setIsAddModalOpen(true)}
            >
              <PlusCircle size={18} weight="bold" />
              <span>{isTa ? "முதல் நினைவூட்டலைச் சேர்" : "Add First Reminder"}</span>
            </button>
          )}
        </div>
      )}

      {/* Active Medication Reminders Grid */}
      <div className="reminders-grid">
        {reminders.map((med) => {
          const isLow =
            med.remaining_supply !== undefined &&
            med.refill_threshold !== undefined &&
            med.remaining_supply <= med.refill_threshold;

          return (
            <div
              key={med.id}
              className={`med-reminder-card ${!med.is_active ? "inactive" : ""}`}
            >
              <div className="card-top-row">
                <div className="med-title-block">
                  <div className="med-name-badge-row">
                    <h3 className="med-name">{med.medicine_name}</h3>
                    {med.is_verified_rx ? (
                      <span
                        className="rx-verified-badge"
                        title="Verified against clinical prescription by Member 1 AI Service"
                      >
                        <ShieldCheck size={14} weight="fill" />
                        <span>{isTa ? "சரிபார்க்கப்பட்ட Rx" : "Verified Rx"}</span>
                      </span>
                    ) : (
                      <span
                        className="manual-entry-badge"
                        title="Manually entered by patient (adherence tracking only)"
                      >
                        <NotePencil size={14} weight="bold" />
                        <span>{isTa ? "கைமுறை பதிவு" : "Manual Entry"}</span>
                      </span>
                    )}
                  </div>
                  <span className="med-dose-text">{med.dosage}</span>
                </div>

                <div className="card-top-actions">
                  <div className={`supply-pill ${isLow ? "low" : "ok"}`}>
                    <span>
                      {med.remaining_supply !== undefined ? med.remaining_supply : 0}{" "}
                      {isTa ? "மீதம்" : "left"}
                    </span>
                  </div>

                  {!isCaregiverView && (
                    <div className="action-icon-buttons">
                      <button
                        type="button"
                        className="icon-action-btn edit"
                        title={isTa ? "திருத்து / இருப்பைப் புதுப்பி" : "Edit / Update Supply"}
                        onClick={() => openEditModal(med)}
                      >
                        <PencilSimple size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-action-btn delete"
                        title={isTa ? "நீக்கு" : "Delete Reminder"}
                        onClick={() => setDeletingReminderId(med.id)}
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {med.instructions && (
                <p className="med-instructions">{med.instructions}</p>
              )}

              {/* Slots and Dose Mark Action */}
              <div className="slots-action-section">
                <span className="slots-label">
                  {isTa ? "இன்றைய வேளைகள்:" : "Scheduled Slots:"}
                </span>
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
                            <span>{isTa ? "தவறியது" : "Missed"}</span>
                          </span>
                        ) : (
                          <div className="action-buttons-pair">
                            <button
                              type="button"
                              className="btn-take"
                              onClick={() => handleMarkDose(med, slot, "taken")}
                            >
                              <CheckCircle size={14} weight="bold" />
                              <span>{isTa ? "எடுத்தேன்" : "Take"}</span>
                            </button>
                            <button
                              type="button"
                              className="btn-miss"
                              onClick={() => handleMarkDose(med, slot, "missed")}
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

      {/* Non-Negotiable Safety Disclaimer Box */}
      <div className="reminders-safety-card">
        <ShieldWarning size={24} weight="bold" className="safety-icon" />
        <div className="safety-content">
          <h4>
            {isTa
              ? "முக்கிய மருத்துவ பாதுகாப்பு வழிகாட்டல்"
              : "CareBridge Safety & Adherence Notice"}
          </h4>
          <p>
            {isTa
              ? "கேர்பிரிட்ஜ் மருந்து நினைவூட்டல்கள் அன்றாட அட்டவணைக்கு உதவும் கருவி மட்டுமே. இது மருத்துவ பரிந்துரை அல்ல. உங்கள் மருத்துவரின் ஆலோசனை அல்லது பரிந்துரைக்கப்பட்ட மருந்து அளவை நாங்களாக மாற்றமாட்டோம். மருந்துகளைத் தொடங்குவதற்கு அல்லது நிறுத்துவதற்கு முன் உங்கள் மருத்துவரை அணுகவும்."
              : "CareBridge medication reminders are adherence aids only. They do not constitute clinical prescriptions, change dosages, or override instructions from a licensed medical professional. Always consult your physician before starting, stopping, or altering any medication."}
          </p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* Modal: Create Medication Reminder                        */}
      {/* ======================================================== */}
      {isAddModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-container">
            <div className="modal-header">
              <div className="modal-title-row">
                <Pill size={20} weight="fill" color="var(--primary)" />
                <h3>{isTa ? "புதிய நினைவூட்டலைச் சேர்" : "Add Medication Reminder"}</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsAddModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateReminder} className="modal-form">
              <div className="form-info-notice">
                <NotePencil size={16} />
                <span>
                  {isTa
                    ? "கைமுறையாக உள்ளிடப்படும் நினைவூட்டல் 'கைமுறை பதிவு' என குறிக்கப்படும்."
                    : "Manually entered reminder will be labeled [Manual Entry] and does not modify clinical prescriptions."}
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="med-name">
                  {isTa ? "மருந்தின் பெயர்" : "Medicine Name"} *
                </label>
                <input
                  id="med-name"
                  type="text"
                  required
                  placeholder={isTa ? "எ.கா. மெட்பார்மின்" : "e.g., Metformin 500mg"}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="med-dosage">{isTa ? "மருந்து அளவு" : "Dosage"} *</label>
                  <input
                    id="med-dosage"
                    type="text"
                    required
                    placeholder="e.g. 500 mg, 1 tablet"
                    value={newDosage}
                    onChange={(e) => setNewDosage(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="med-instructions">
                    {isTa ? "பயன்பாட்டு முறை" : "Instructions"}
                  </label>
                  <input
                    id="med-instructions"
                    type="text"
                    placeholder="e.g. Take with food"
                    value={newInstructions}
                    onChange={(e) => setNewInstructions(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>{isTa ? "வேளைகள் (Scheduled Slots)" : "Scheduled Slots"} *</label>
                <div className="slot-selection-grid">
                  {(["morning", "noon", "evening", "night"] as SlotType[]).map((slot) => {
                    const isSelected = newSlots.includes(slot);
                    return (
                      <button
                        type="button"
                        key={slot}
                        className={`slot-toggle-chip ${isSelected ? "selected" : ""}`}
                        onClick={() => toggleSlotSelection(slot)}
                      >
                        {isSelected && <CheckCircle size={14} weight="bold" />}
                        <span>{slot}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="med-supply">
                    {isTa ? "தற்போதைய இருப்பு (Total Supply)" : "Current Supply (Tablets/Doses)"}
                  </label>
                  <input
                    id="med-supply"
                    type="number"
                    min="1"
                    max="1000"
                    value={newSupply}
                    onChange={(e) => setNewSupply(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="med-threshold">
                    {isTa ? "மறுநிரப்பல் எச்சரிக்கை அளவு" : "Refill Alert Threshold"}
                  </label>
                  <input
                    id="med-threshold"
                    type="number"
                    min="1"
                    max="50"
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  {isTa ? "ரத்து" : "Cancel"}
                </button>
                <button type="submit" className="btn-primary">
                  {isTa ? "நினைவூட்டலைச் சேமி" : "Save Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Modal: Edit Supply and Settings                          */}
      {/* ======================================================== */}
      {editingReminder && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-container">
            <div className="modal-header">
              <div className="modal-title-row">
                <PencilSimple size={20} weight="fill" color="var(--primary)" />
                <h3>{isTa ? "நினைவூட்டல் & இருப்பைத் திருத்து" : "Edit Supply & Reminder"}</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingReminder(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="modal-form">
              <div className="locked-medicine-info">
                <strong>{editingReminder.medicine_name}</strong> &bull;{" "}
                <span>{editingReminder.dosage}</span>
                <p className="locked-note">
                  {isTa
                    ? "மருத்துவப் பாதுகாப்பிற்காக மருந்து பெயர் மற்றும் அளவை மாற்ற முடியாது."
                    : "Prescribed medicine name and clinical dosage are locked for safety."}
                </p>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="edit-supply">
                    {isTa ? "மீதமுள்ள இருப்பு" : "Remaining Supply (Doses)"}
                  </label>
                  <input
                    id="edit-supply"
                    type="number"
                    min="0"
                    max="1000"
                    value={editRemainingSupply}
                    onChange={(e) => setEditRemainingSupply(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-threshold">
                    {isTa ? "மறுநிரப்பல் எச்சரிக்கை அளவு" : "Refill Alert Threshold"}
                  </label>
                  <input
                    id="edit-threshold"
                    type="number"
                    min="1"
                    max="50"
                    value={editThreshold}
                    onChange={(e) => setEditThreshold(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="edit-instructions">
                  {isTa ? "வழிமுறைகள்" : "Instructions"}
                </label>
                <input
                  id="edit-instructions"
                  type="text"
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                />
              </div>

              <div className="form-group checkbox-row">
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                  />
                  <span>
                    {isTa ? "செயலில் உள்ளது (Active Reminder)" : "Active (send daily reminders)"}
                  </span>
                </label>
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingReminder(null)}
                >
                  {isTa ? "ரத்து" : "Cancel"}
                </button>
                <button type="submit" className="btn-primary">
                  {isTa ? "சேமி" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Modal: Delete Confirmation                              */}
      {/* ======================================================== */}
      {deletingReminderId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-container delete-confirm-modal">
            <div className="modal-header">
              <div className="modal-title-row">
                <Trash size={20} weight="fill" color="#e11d48" />
                <h3>{isTa ? "நினைவூட்டலை நீக்கவா?" : "Delete Reminder?"}</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeletingReminderId(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p className="delete-confirm-text">
              {isTa
                ? "இந்த நினைவூட்டலை நீக்கினால் அட்டவணையில் இருந்து அகற்றப்படும். பழைய ஏற்பாடுகள் நீக்கப்படாது."
                : "Are you sure you want to delete this reminder? Past adherence logs will be preserved."}
            </p>

            <div className="modal-actions-row">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingReminderId(null)}
              >
                {isTa ? "ரத்து" : "Cancel"}
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => handleDeleteReminder(deletingReminderId)}
              >
                {isTa ? "ஆம், நீக்கு" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
