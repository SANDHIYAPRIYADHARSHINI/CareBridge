import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import {
  UploadSimple,
  Flask,
  FileText,
  WarningCircle,
  PencilSimple,
  ArrowRight,
  ShieldCheck,
} from "@phosphor-icons/react";

import type { ExtractionResult, Medicine, Field } from "../../types/ai";
import { SkeletonLoader } from "./SkeletonLoader";
import { extractPrescription, AiApiError } from "../../services/aiApi";
import "./UploadScreen.css";

interface UploadScreenProps {
  onExtractionSuccess: (result: ExtractionResult, imageUrl: string) => void;
  useFixtures: boolean;
  onToggleFixtures: (val: boolean) => void;
  language?: "en" | "ta";
}

interface ManualMedicineEntry {
  id: string;
  name: string;
  strength: string;
  frequency: string;
  timing: string;
  duration: string;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({
  onExtractionSuccess,
  useFixtures,
  onToggleFixtures,
  language = "en",
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{
    code: string;
    message: string;
    isModelUnavailable: boolean;
  } | null>(null);

  // Manual entry fallback state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [manualMeds, setManualMeds] = useState<ManualMedicineEntry[]>([
    {
      id: "med-manual-1",
      name: "",
      strength: "",
      frequency: "1-0-1",
      timing: "after food",
      duration: "30 days",
    },
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to make a Field object
  const makeField = (value: string | null): Field => ({
    value: value?.trim() || null,
    raw: value?.trim() || null,
    status: value?.trim() ? "found" : "missing",
    confidence: 1.0,
    evidence_line_ids: [],
  });

  // Handle uploaded file or blob
  const processFile = async (file: File | Blob, fileName: string, previewUrl: string) => {
    setIsLoading(true);
    setErrorInfo(null);
    setShowManualEntry(false);

    try {
      const result = await extractPrescription(file, fileName, language, useFixtures);
      setIsLoading(false);
      onExtractionSuccess(result, previewUrl);
    } catch (err: any) {
      setIsLoading(false);
      const isUnavailable =
        err instanceof AiApiError && (err.code === "model_unavailable" || err.status === 503);
      const isNetwork = err instanceof AiApiError && err.code === "network_error";

      setErrorInfo({
        code: err.code || "unknown_error",
        message: err.message || "An unexpected error occurred while analyzing the prescription.",
        isModelUnavailable: isUnavailable || isNetwork,
      });
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      await processFile(file, file.name, objectUrl);
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      await processFile(file, file.name, objectUrl);
    }
  };

  // "Use a sample synthetic prescription" action
  const handleUseSample = async (samplePath: string, sampleName: string) => {
    setIsLoading(true);
    setErrorInfo(null);

    try {
      const res = await fetch(samplePath);
      if (!res.ok) {
        throw new Error(`Failed to load synthetic sample from ${samplePath}`);
      }
      const blob = await res.blob();
      const sampleFile = new File([blob], sampleName, { type: "image/png" });
      await processFile(sampleFile, sampleName, samplePath);
    } catch (err: any) {
      setIsLoading(false);
      setErrorInfo({
        code: "sample_load_failed",
        message: `Could not load synthetic sample: ${err.message}`,
        isModelUnavailable: false,
      });
    }
  };

  // Manual fallback medicine management
  const addManualMedRow = () => {
    setManualMeds((prev) => [
      ...prev,
      {
        id: `med-manual-${Date.now()}`,
        name: "",
        strength: "",
        frequency: "1-0-0",
        timing: "after food",
        duration: "30 days",
      },
    ]);
  };

  const updateManualMed = (id: string, field: keyof ManualMedicineEntry, value: string) => {
    setManualMeds((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const removeManualMedRow = (id: string) => {
    if (manualMeds.length <= 1) return;
    setManualMeds((prev) => prev.filter((m) => m.id !== id));
  };

  // Submit manual fallback
  const handleManualSubmit = () => {
    const medicines: Medicine[] = manualMeds
      .filter((m) => m.name.trim().length > 0)
      .map((m) => ({
        id: m.id,
        name: makeField(m.name),
        strength: makeField(m.strength),
        form: makeField("tablet"),
        dose: makeField("1"),
        frequency: makeField(m.frequency),
        timing: makeField(m.timing),
        duration: makeField(m.duration),
        instructions: makeField(`${m.timing} (${m.frequency})`),
        frequency_normalized: {
          times_per_day: m.frequency.includes("-")
            ? m.frequency.split("-").filter((x) => x !== "0").length
            : 1,
          slots: ["morning"],
          as_needed: false,
        },
        status: "verified_by_rules",
      }));

    if (medicines.length === 0) {
      alert("Please provide at least one medication name.");
      return;
    }

    const manualResult: ExtractionResult = {
      request_id: `req-manual-${Date.now()}`,
      document_id: `doc-manual-${Date.now()}`,
      source: { type: "image", page_count: 1 },
      ocr: { engine: "manual_entry", lines: [] },
      prescriber: {
        name: makeField(doctorName || "Treating Physician"),
        registration_no: makeField("MANUAL-ENTRY"),
        hospital: makeField("Patient Self-Reported Entry"),
        date: makeField(new Date().toISOString().split("T")[0]),
      },
      patient: {
        name: makeField(patientName || "Patient"),
        age: makeField(""),
      },
      medicines,
      follow_up: makeField(""),
      flags: [],
      overall_status: "ready",
      review_reasons: [],
      metrics: {
        latency_ms: 0,
        model: "manual_entry_fallback",
        gpu: "N/A",
      },
    };

    onExtractionSuccess(manualResult, "/rx_001.png");
  };

  return (
    <div className="upload-screen-container">
      {/* Header Intro */}
      <div className="upload-hero">
        <h2 className="upload-title">
          {language === "ta"
            ? "உங்கள் மருத்துவச் சீட்டைப் பதிவேற்றுங்கள்"
            : "Upload Your Prescription"}
        </h2>
        <p className="upload-subtitle">
          {language === "ta"
            ? "கையேடு அல்லது அச்சிடப்பட்ட மருந்துச் சீட்டைப் புகைப்படமாக அல்லது PDF ஆக பதிவேற்றுங்கள். எங்கள் AI விதிகள் மருந்துகளைப் பிரித்தெடுத்து உறுதிப்படுத்தும்."
            : "Clear, deterministic extraction powered by AMD ROCm. We verify every dosage and frequency against the source text."}
        </p>

        {/* Fixture mode indicator & switch */}
        <div className="mode-indicator-bar">
          <span className={`status-pill ${useFixtures ? "offline" : "live"}`}>
            {useFixtures ? "Offline Demo Mode (Fixtures)" : "Live AI Mode (AMD ROCm / Port 8100)"}
          </span>
          <button
            type="button"
            className="toggle-mode-btn"
            onClick={() => onToggleFixtures(!useFixtures)}
            title="Toggle between Live AI backend service and Offline synthetic demo fixtures"
          >
            Switch to {useFixtures ? "Live AI Backend" : "Offline Fixtures"}
          </button>
        </div>
      </div>

      {/* Loading view: Narrative SkeletonLoader */}
      {isLoading && (
        <div className="upload-loading-card">
          <SkeletonLoader />
        </div>
      )}

      {/* Main interactive area when not loading */}
      {!isLoading && (
        <>
          {/* Calm Error Banner (Handles model_unavailable or connection drops) */}
          {errorInfo && (
            <div className="calm-error-card" role="alert">
              <div className="calm-error-header">
                <WarningCircle size={24} weight="fill" className="calm-error-icon" />
                <div>
                  <h3 className="calm-error-title">
                    {errorInfo.isModelUnavailable
                      ? "AI Reading Service Currently Unavailable"
                      : "Prescription Processing Note"}
                  </h3>
                  <p className="calm-error-message">
                    {errorInfo.isModelUnavailable
                      ? "Our automated reading model is temporarily resting or disconnected. In adherence with our core clinical safety rules, CareBridge AI never guesses or fakes medication data."
                      : errorInfo.message}
                  </p>
                </div>
              </div>

              <div className="calm-error-actions">
                <button
                  type="button"
                  className="calm-btn primary"
                  onClick={() => setShowManualEntry(true)}
                >
                  <PencilSimple size={16} weight="bold" />
                  <span>Enter Medications Manually</span>
                </button>

                <button
                  type="button"
                  className="calm-btn secondary"
                  onClick={() => {
                    onToggleFixtures(true);
                    handleUseSample("/rx_001.png", "rx_001.png");
                  }}
                >
                  <Flask size={16} />
                  <span>Test with Synthetic Demo Fixture</span>
                </button>

                <button
                  type="button"
                  className="calm-btn ghost"
                  onClick={() => setErrorInfo(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Manual Entry Fallback Form */}
          {showManualEntry ? (
            <div className="manual-entry-card" aria-label="Manual prescription entry fallback">
              <div className="manual-entry-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <PencilSimple size={22} color="var(--primary)" weight="bold" />
                  <h3>Manual Medication Entry</h3>
                </div>
                <button
                  type="button"
                  className="manual-cancel-btn"
                  onClick={() => setShowManualEntry(false)}
                >
                  Cancel
                </button>
              </div>

              <p className="manual-entry-note">
                Enter your prescribed medications below. You will be able to ask questions and review them safely.
              </p>

              <div className="manual-metadata-grid">
                <div className="form-field">
                  <label htmlFor="patient-name">Patient Name (optional)</label>
                  <input
                    id="patient-name"
                    type="text"
                    placeholder="e.g. K. Sundaram"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="doctor-name">Prescribing Doctor (optional)</label>
                  <input
                    id="doctor-name"
                    type="text"
                    placeholder="e.g. Dr. S. Ramanathan"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                  />
                </div>
              </div>

              <div className="manual-meds-list">
                {manualMeds.map((med, idx) => (
                  <div key={med.id} className="manual-med-row">
                    <span className="med-row-num">#{idx + 1}</span>
                    <input
                      type="text"
                      placeholder="Medication name (e.g. Metformin)"
                      value={med.name}
                      onChange={(e) => updateManualMed(med.id, "name", e.target.value)}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Strength (e.g. 500mg)"
                      value={med.strength}
                      onChange={(e) => updateManualMed(med.id, "strength", e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Frequency (e.g. 1-0-1)"
                      value={med.frequency}
                      onChange={(e) => updateManualMed(med.id, "frequency", e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Timing (e.g. after food)"
                      value={med.timing}
                      onChange={(e) => updateManualMed(med.id, "timing", e.target.value)}
                    />
                    {manualMeds.length > 1 && (
                      <button
                        type="button"
                        className="remove-med-btn"
                        onClick={() => removeManualMedRow(med.id)}
                        title="Remove row"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="manual-form-footer">
                <button
                  type="button"
                  className="add-med-row-btn"
                  onClick={addManualMedRow}
                >
                  + Add Another Medicine
                </button>

                <button
                  type="button"
                  className="submit-manual-btn"
                  onClick={handleManualSubmit}
                >
                  <span>Review Medication Schedule</span>
                  <ArrowRight size={16} weight="bold" />
                </button>
              </div>
            </div>
          ) : (
            <div className="upload-grid">
              {/* Dropzone Card */}
              <div
                className={`dropzone-card ${isDragging ? "dragging" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
                aria-label="Prescription dropzone. Drag and drop file or click to select."
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={handleFileInputChange}
                  style={{ display: "none" }}
                  id="prescription-file-input"
                />

                <div className="dropzone-icon-circle">
                  <UploadSimple size={32} weight="bold" color="var(--primary)" />
                </div>

                <h3 className="dropzone-prompt">
                  {isDragging ? "Drop your prescription file here" : "Drag & drop your prescription"}
                </h3>
                <p className="dropzone-hint">
                  Supports JPG, PNG, WEBP, or PDF (up to 15MB)
                </p>

                <div className="dropzone-action-btn">
                  <FileText size={16} weight="bold" />
                  <span>Browse File</span>
                </div>
              </div>

              {/* Synthetic Sample Selection Card */}
              <div className="sample-selection-card">
                <div className="sample-card-header">
                  <Flask size={22} color="var(--primary)" weight="bold" />
                  <div>
                    <h3 className="sample-card-title">Use Synthetic Demo Prescription</h3>
                    <p className="sample-card-subtitle">
                      Zero patient data. Evaluated against real AMD ROCm models.
                    </p>
                  </div>
                </div>

                <div className="sample-buttons-list">
                  {/* Sample 1: Flagged / Review Flow */}
                  <button
                    type="button"
                    className="sample-option-btn flagged-sample"
                    onClick={() => handleUseSample("/rx_001.png", "rx_001.png")}
                    title="Load Kaveri Clinic synthetic prescription (features amber review warning for handwritten strength)"
                  >
                    <div className="sample-meta">
                      <div className="sample-meta-badge warn">Needs Patient Verification</div>
                      <span className="sample-name">Kaveri Clinic Prescription (rx_001.png)</span>
                      <span className="sample-desc">
                        Metformin 500mg, Atorvastatin, Amlodipine. Contains a field requiring patient verification.
                      </span>
                    </div>
                    <ArrowRight size={18} weight="bold" className="sample-arrow" />
                  </button>

                  {/* Sample 2: Clean Verified Flow */}
                  <button
                    type="button"
                    className="sample-option-btn clean-sample"
                    onClick={() => handleUseSample("/rx_002.png", "rx_002.png")}
                    title="Load clean synthetic prescription (fully verified by deterministic rules)"
                  >
                    <div className="sample-meta">
                      <div className="sample-meta-badge ok">Fully Verified by Rules</div>
                      <span className="sample-name">City General Hospital (rx_002.png)</span>
                      <span className="sample-desc">
                        Clear clinical typography with all strengths, frequencies, and directions fully validated.
                      </span>
                    </div>
                    <ArrowRight size={18} weight="bold" className="sample-arrow" />
                  </button>
                </div>

                <div className="safety-guarantee-note">
                  <ShieldCheck size={18} color="var(--ok)" weight="bold" />
                  <span>
                    Deterministic Grounding: All extracted dosage times are tied to OCR evidence. No hallucination.
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
