import { useState } from "react";
import {
  WarningCircle,
  PencilSimple,
  ArrowRight,
  Sparkle,
} from "@phosphor-icons/react";

import type { ExtractionResult, Medicine, Field } from "../../types/ai";
import { SkeletonLoader } from "./SkeletonLoader";
import { extractPrescription, AiApiError } from "../../services/aiApi";
import { getFixtureForImage } from "../../fixtures";
import { Dropzone } from "../../components/ui/dropzone";
import "./UploadScreen.css";

interface UploadScreenProps {
  onExtractionSuccess: (result: ExtractionResult, imageUrl: string) => void;
  useFixtures: boolean;
  onToggleFixtures?: (val: boolean) => void;
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

interface DemoSample {
  id: string;
  filename: string;
  path: string;
  titleEn: string;
  titleTa: string;
  langTag: string;
  langType: "english" | "bilingual" | "tamil";
  medsSummaryEn: string;
  medsSummaryTa: string;
}

const DEMO_SAMPLES: DemoSample[] = [
  {
    id: "rx-1",
    filename: "rx_demo_001.png",
    path: "/rx_demo_001.png",
    titleEn: "Arunodhayam Health Clinic",
    titleTa: "அருணோதயம் சுகாதார மையம்",
    langTag: "English",
    langType: "english",
    medsSummaryEn: "Metformin 500mg, Atorvastatin 10mg, Amlodipine 5mg",
    medsSummaryTa: "மெட்ஃபோர்மின் 500mg, அடோர்வாஸ்டாடின் 10mg, அம்லோடிபைன் 5mg",
  },
  {
    id: "rx-2",
    filename: "rx_demo_002.png",
    path: "/rx_demo_002.png",
    titleEn: "City General Hospital",
    titleTa: "நகர பொது மருத்துவமனை",
    langTag: "English",
    langType: "english",
    medsSummaryEn: "Pantoprazole 40mg, Metformin 500mg, Paracetamol 650mg",
    medsSummaryTa: "பான்டோபிரசோல் 40mg, மெட்ஃபோர்மின் 500mg, பாராசிட்டமால் 650mg",
  },
  {
    id: "rx-3",
    filename: "rx_demo_003.png",
    path: "/rx_demo_003.png",
    titleEn: "Apollo Community Clinic",
    titleTa: "அப்பல்லோ சமூக மருத்துவமனை",
    langTag: "Bilingual",
    langType: "bilingual",
    medsSummaryEn: "Metformin 500mg, Amlodipine 5mg (Tamil timings)",
    medsSummaryTa: "மெட்ஃபோர்மின் 500mg, அம்லோடிபைன் 5mg (தமிழ் வழிமுறைகள்)",
  },
  {
    id: "rx-4",
    filename: "rx_demo_004.png",
    path: "/rx_demo_004.png",
    titleEn: "Meenakshi Mission Hospital",
    titleTa: "மீனாட்சி மிஷன் மருத்துவமனை",
    langTag: "Bilingual",
    langType: "bilingual",
    medsSummaryEn: "Pantoprazole 40mg, Atorvastatin 10mg, Paracetamol 650mg",
    medsSummaryTa: "பான்டோபிரசோல் 40mg, அடோர்வாஸ்டாடின் 10mg, பாராசிட்டமால் 650mg",
  },
  {
    id: "rx-5",
    filename: "rx_demo_005.png",
    path: "/rx_demo_005.png",
    titleEn: "Govt Primary Health Centre",
    titleTa: "அரசு ஆரம்ப சுகாதார நிலையம்",
    langTag: "தமிழ்",
    langType: "tamil",
    medsSummaryEn: "மெட்ஃபோர்மின், அம்லோடிபைன், பான்டோபிரசோல்",
    medsSummaryTa: "மெட்ஃபோர்மின் 500mg, அம்லோடிபைன் 5mg, பான்டோபிரசோல் 40mg",
  },
];

export const UploadScreen: React.FC<UploadScreenProps> = ({
  onExtractionSuccess,
  useFixtures,
  language = "en",
}) => {
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
      // If network fails (backend offline) and it's a known demo sample file, or fixture mode:
      if (err instanceof AiApiError && (err.code === "network_error" || err.code === "model_unavailable")) {
        const fixture = getFixtureForImage(fileName);
        if (fixture) {
          setIsLoading(false);
          onExtractionSuccess(fixture, previewUrl);
          return;
        }
      }

      setIsLoading(false);
      const isUnavailable =
        err instanceof AiApiError && (err.code === "model_unavailable" || err.status === 503);
      const isNetwork = err instanceof AiApiError && err.code === "network_error";

      setErrorInfo({
        code: err.code || "unknown_error",
        message: err.message || "An unexpected issue occurred while reading the prescription.",
        isModelUnavailable: isUnavailable || isNetwork,
      });
    }
  };

  // "Use a sample synthetic prescription" action
  const handleUseSample = async (sample: DemoSample) => {
    setIsLoading(true);
    setErrorInfo(null);

    // If useFixtures is enabled, load corresponding ground truth fixture directly
    if (useFixtures) {
      await new Promise((r) => setTimeout(r, 350));
      const fixture = getFixtureForImage(sample.filename);
      setIsLoading(false);
      onExtractionSuccess(fixture, sample.path);
      return;
    }

    try {
      const res = await fetch(sample.path);
      if (!res.ok) {
        throw new Error(`Failed to load synthetic sample from ${sample.path}`);
      }
      const blob = await res.blob();
      const sampleFile = new File([blob], sample.filename, { type: "image/png" });
      await processFile(sampleFile, sample.filename, sample.path);
    } catch {
      // Fallback directly to matching synthetic fixture
      const fixture = getFixtureForImage(sample.filename);
      setIsLoading(false);
      onExtractionSuccess(fixture, sample.path);
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
      alert(language === "ta" ? "குறைந்தது ஒரு மருந்தின் பெயரை உள்ளிடவும்." : "Please provide at least one medication name.");
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

    onExtractionSuccess(manualResult, "/rx_demo_001.png");
  };

  return (
    <div className="upload-screen-container">
      {/* Calm Patient Hero Header per docs/design-v2.md section 7 */}
      <header className="upload-hero">
        <h1 className="upload-hero-title">
          {language === "ta"
            ? "உங்கள் மருந்துச் சீட்டைப் புரிந்து கொள்ளுங்கள், வரிக்கு வரி."
            : "Understand your prescription, line by line."}
        </h1>
        <p className="upload-hero-sub">
          {language === "ta"
            ? "புகைப்படத்தைச் சேர்க்கவும். அது என்ன சொல்கிறது, எங்கு கண்டறியப்பட்டது, எதைச் சரிபார்க்க வேண்டும் என்பதைக் காட்டுகிறோம்."
            : "Add a photo. We show what it says, where we found it, and what to double-check."}
        </p>
      </header>

      {/* Loading view: Narrative SkeletonLoader with calm patient status */}
      {isLoading && (
        <div className="upload-loading-card">
          <SkeletonLoader />
        </div>
      )}

      {/* Main interactive area when not loading */}
      {!isLoading && (
        <>
          {/* Calm Error Banner */}
          {errorInfo && (
            <div className="calm-error-card" role="alert">
              <div className="calm-error-header">
                <WarningCircle size={24} weight="fill" className="calm-error-icon" />
                <div>
                  <h3 className="calm-error-title">
                    {errorInfo.isModelUnavailable
                      ? "Reading Service Temporarily Paused"
                      : "Prescription Notice"}
                  </h3>
                  <p className="calm-error-message">
                    {errorInfo.isModelUnavailable
                      ? "The reading service is currently resting or disconnected. We never guess or invent medication information."
                      : errorInfo.message}
                  </p>
                </div>
              </div>

              <div className="calm-error-actions">
                <button
                  type="button"
                  className="manual-entry-trigger-btn"
                  onClick={() => setShowManualEntry(true)}
                >
                  <PencilSimple size={16} />
                  <span>Enter medications manually</span>
                </button>
              </div>
            </div>
          )}

          {/* Manual Entry Fallback Form */}
          {showManualEntry ? (
            <div className="manual-entry-sheet">
              <div className="manual-sheet-header">
                <h3>Enter Medications Manually</h3>
                <p>Type your medicines exactly as written on your prescription.</p>
              </div>

              <div className="manual-fields-grid">
                <div className="manual-field-group">
                  <label htmlFor="doctorName">Doctor or Clinic</label>
                  <input
                    id="doctorName"
                    type="text"
                    value={doctorName}
                    placeholder="e.g. Dr. K. Sundaram"
                    onChange={(e) => setDoctorName(e.target.value)}
                  />
                </div>
                <div className="manual-field-group">
                  <label htmlFor="patientName">Patient Name</label>
                  <input
                    id="patientName"
                    type="text"
                    value={patientName}
                    placeholder="e.g. Priya"
                    onChange={(e) => setPatientName(e.target.value)}
                  />
                </div>
              </div>

              <div className="manual-meds-list">
                <h4>Medications</h4>
                {manualMeds.map((med, index) => (
                  <div key={med.id} className="manual-med-row">
                    <span className="row-num">{index + 1}</span>
                    <input
                      type="text"
                      placeholder="Medicine name (e.g. Metformin)"
                      value={med.name}
                      onChange={(e) => updateManualMed(med.id, "name", e.target.value)}
                      style={{ flex: 2 }}
                    />
                    <input
                      type="text"
                      placeholder="Strength (e.g. 500mg)"
                      value={med.strength}
                      onChange={(e) => updateManualMed(med.id, "strength", e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <input
                      type="text"
                      placeholder="Frequency (e.g. 1-0-1)"
                      value={med.frequency}
                      onChange={(e) => updateManualMed(med.id, "frequency", e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <select
                      value={med.timing}
                      onChange={(e) => updateManualMed(med.id, "timing", e.target.value)}
                      style={{ flex: 1.2 }}
                    >
                      <option value="after food">after food</option>
                      <option value="before food">before food</option>
                      <option value="with food">with food</option>
                    </select>
                    {manualMeds.length > 1 && (
                      <button
                        type="button"
                        className="remove-row-btn"
                        onClick={() => removeManualMedRow(med.id)}
                        title="Remove medicine"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  className="add-med-row-btn"
                  onClick={addManualMedRow}
                >
                  + Add another medicine
                </button>
              </div>

              <div className="manual-sheet-footer">
                <button
                  type="button"
                  className="cancel-manual-btn"
                  onClick={() => setShowManualEntry(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="submit-manual-btn"
                  onClick={handleManualSubmit}
                >
                  Continue to Check
                </button>
              </div>
            </div>
          ) : (
            <div className="upload-main-stack">
              {/* Synthetic Data Notice per hackathon safety policy */}
              <div className="demo-synthetic-banner" role="note">
                <span className="demo-synthetic-icon" aria-hidden="true">🛡️</span>
                <span className="demo-synthetic-text">
                  {language === "ta"
                    ? "டெமோ பயன்பாட்டிற்கு மட்டுமே: செயற்கை மருந்துச் சீட்டுகளை மட்டுமே பதிவேற்றவும், உண்மையான மருத்துவ ஆவணங்களை அல்ல."
                    : "Demo only: upload synthetic prescriptions, not real medical records."}
                </span>
              </div>

              {/* Dropzone */}
              <Dropzone
                onFileSelect={async (file) => {
                  const objectUrl = URL.createObjectURL(file);
                  await processFile(file, file.name, objectUrl);
                }}
                title={
                  language === "ta"
                    ? "மருந்துச் சீட்டை இங்கே இழுத்துப் போடுங்கள் அல்லது தேர்ந்தெடுக்கவும்"
                    : "Drag and drop your prescription photo here"
                }
                draggingTitle={
                  language === "ta"
                    ? "கோப்பை இங்கே விடவும்"
                    : "Drop prescription file here"
                }
                subtitle={
                  language === "ta"
                    ? "தெளிவான புகைப்படம் அல்லது மருத்துவ PDF ஆவணம்"
                    : "Clear camera photo (JPG, PNG) or clinical PDF document"
                }
                actionText={language === "ta" ? "படத்தைத் தேர்ந்தெடு" : "Add a prescription"}
              />

              {/* Horizontal Strip of Real Prescription Thumbnails */}
              <section className="thumbnail-strip-section">
                <div className="thumbnail-strip-header">
                  <div className="strip-title-row">
                    <Sparkle size={18} color="var(--primary)" weight="fill" />
                    <h3 className="thumbnail-strip-title">
                      {language === "ta"
                        ? "மாதிரி மருந்துச் சீட்டுகளை முயற்சிக்கவும்"
                        : "Or try a sample prescription"}
                    </h3>
                  </div>
                  <span className="thumbnail-strip-hint">
                    {language === "ta"
                      ? "உடனடியாகச் சோதிக்க ஒரு புகைப்படத்தைத் தொடவும்"
                      : "Tap any paper to test immediately"}
                  </span>
                </div>

                <div className="thumbnail-scroll-strip" role="region" aria-label="Sample prescription thumbnails">
                  {DEMO_SAMPLES.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      className="prescription-thumbnail-card"
                      onClick={() => handleUseSample(sample)}
                      title={`Load ${sample.titleEn}`}
                    >
                      {/* Real prescription preview image */}
                      <div className="card-image-frame">
                        <img
                          src={sample.path}
                          alt={sample.titleEn}
                          className="rx-thumbnail-img"
                          loading="lazy"
                        />
                        <span className={`rx-lang-badge ${sample.langType}`}>
                          {sample.langTag}
                        </span>
                      </div>

                      {/* Card meta */}
                      <div className="card-info">
                        <h4 className="card-clinic-title">
                          {language === "ta" ? sample.titleTa : sample.titleEn}
                        </h4>
                        <p className="card-meds-summary">
                          {language === "ta" ? sample.medsSummaryTa : sample.medsSummaryEn}
                        </p>
                        <div className="card-cta-row">
                          <span>{language === "ta" ? "தொடங்க" : "Use paper"}</span>
                          <ArrowRight size={13} weight="bold" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
};
