import { useState } from "react";
import {
  CheckCircle,
  Warning,
  Question,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsCounterClockwise,
  ArrowRight,
  ShieldCheck,
  UploadSimple,
  Flask,
} from "@phosphor-icons/react";
import type { ExtractionResult, Medicine } from "../../types/ai";
import "./PrescriptionReview.css";

interface PrescriptionReviewProps {
  extraction: ExtractionResult;
  imageUrl?: string;
  useFixtures?: boolean;
  onHoverLine?: (lineIds: string[]) => void;
  onConfirmReminders?: () => void;
  onReUpload?: () => void;
}

export const PrescriptionReview: React.FC<PrescriptionReviewProps> = ({
  extraction,
  imageUrl = "/rx_demo_001.png",
  useFixtures = false,
  onHoverLine,
  onConfirmReminders,
  onReUpload,
}) => {

  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [highlightedLineIds, setHighlightedLineIds] = useState<string[]>([]);
  const [acknowledgedMedIds, setAcknowledgedMedIds] = useState<Record<string, boolean>>({});
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.75));
  const handleZoomReset = () => setZoomLevel(1.0);

  // Hover handlers for OCR line linkage
  const handleLineHover = (lineIds: string[]) => {
    setHighlightedLineIds(lineIds);
    if (onHoverLine) onHoverLine(lineIds);
  };

  const handleLineLeave = () => {
    setHighlightedLineIds([]);
    if (onHoverLine) onHoverLine([]);
  };

  // Check if any medicine requires patient review acknowledgement
  const flaggedMeds = extraction.medicines.filter((m) => m.status === "needs_review");
  const allAcknowledged = flaggedMeds.every((m) => acknowledgedMedIds[m.id]);

  const toggleAcknowledge = (medId: string) => {
    setAcknowledgedMedIds((prev) => ({
      ...prev,
      [medId]: !prev[medId],
    }));
  };

  const handleConfirm = () => {
    setIsConfirmed(true);
    if (onConfirmReminders) onConfirmReminders();
  };

  return (
    <div className="prescription-review-layout" aria-label="Prescription verification interface">
      {/* Persistent Fixtures Notice */}
      {useFixtures && (
        <div className="review-fixtures-banner" role="status" aria-label="Fixtures mode status banner">
          <div className="review-fixtures-badge">
            <Flask size={18} weight="bold" />
            <span>Offline sample data, not live AI</span>
          </div>
          <span className="review-fixtures-note">
            Prescription fields shown below are from synthetic demo fixtures. To run live inference on AMD ROCm, toggle Live AI in the header.
          </span>
        </div>
      )}
      {/* ------------------------------------------------------------------ */}
      {/* Left Column: Zoomable Document Viewer with Interactive OCR Overlay */}
      {/* ------------------------------------------------------------------ */}
      <section className="doc-viewer-panel" aria-label="Original prescription document viewer">
        <div className="doc-viewer-toolbar">
          <div className="doc-viewer-title">
            <ShieldCheck size={20} color="var(--primary)" weight="bold" />
            <span>Original Document</span>
          </div>
          <div className="doc-viewer-controls">
            <button
              className="zoom-btn"
              onClick={handleZoomOut}
              title="Zoom out"
              aria-label="Zoom out prescription"
            >
              <MagnifyingGlassMinus size={16} />
            </button>
            <button
              className="zoom-reset-btn font-mono"
              onClick={handleZoomReset}
              title="Reset zoom"
              aria-label="Reset zoom level"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              className="zoom-btn"
              onClick={handleZoomIn}
              title="Zoom in"
              aria-label="Zoom in prescription"
            >
              <MagnifyingGlassPlus size={16} />
            </button>
            <button
              className="zoom-btn"
              onClick={handleZoomReset}
              title="Reset view"
              aria-label="Reset view position"
            >
              <ArrowsCounterClockwise size={16} />
            </button>
            {onReUpload && (
              <button
                type="button"
                className="zoom-btn"
                onClick={onReUpload}
                title="Upload a different prescription"
                aria-label="Upload a different prescription"
                style={{ width: "auto", padding: "0 0.5rem", fontSize: "0.8rem", gap: "0.25rem", display: "inline-flex", alignItems: "center" }}
              >
                <UploadSimple size={14} />
                <span>New Rx</span>
              </button>
            )}
          </div>

        </div>

        <div className="doc-viewer-viewport">
          <div
            className="doc-image-wrapper"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            <img
              src={imageUrl}
              alt="Uploaded prescription document scanned for medications"
              className="rx-source-image"
            />

            {/* OCR Bounding Boxes Layer */}
            <div className="ocr-bounding-layer" aria-hidden="true">
              {extraction.ocr.lines.map((line) => {
                const [x, y, w, h] = line.bbox;
                const isHighlighted = highlightedLineIds.includes(line.id);

                return (
                  <div
                    key={line.id}
                    className={`ocr-bbox ${isHighlighted ? "highlighted" : ""}`}
                    style={{
                      left: `${x}px`,
                      top: `${y}px`,
                      width: `${w}px`,
                      height: `${h}px`,
                    }}
                    onMouseEnter={() => handleLineHover([line.id])}
                    onMouseLeave={handleLineLeave}
                  >
                    <span className="ocr-bbox-label">{line.id}: {line.text.slice(0, 24)}...</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="doc-viewer-legend">
          <div className="legend-chip">
            <span className="legend-swatch"></span>
            <span>Hover a field or card to highlight source line in yellow</span>
          </div>
          <span className="font-mono">{extraction.ocr.lines.length} lines detected</span>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Right Column: Prescriber metadata and Extracted Medicine Cards     */}
      {/* ------------------------------------------------------------------ */}
      <section className="cards-column" aria-label="Extracted medication cards">
        {/* Prescriber & Patient Metadata Card */}
        <div className="prescriber-card">
          <div className="prescriber-header">
            <div>
              <h2 className="hospital-name">{extraction.prescriber.hospital.value}</h2>
              <div className="doctor-name">{extraction.prescriber.name.value}</div>
            </div>
            <span className="reg-badge">{extraction.prescriber.registration_no.value}</span>
          </div>

          <div className="patient-meta-grid">
            <div>
              <span className="meta-label">Patient</span>
              <div className="meta-value">{extraction.patient.name.value}</div>
            </div>
            <div>
              <span className="meta-label">Age</span>
              <div className="meta-value">{extraction.patient.age.value} Years</div>
            </div>
            <div>
              <span className="meta-label">Prescribed Date</span>
              <div className="meta-value font-mono">{extraction.prescriber.date.value}</div>
            </div>
            <div>
              <span className="meta-label">Follow-Up</span>
              <div className="meta-value">{extraction.follow_up.value}</div>
            </div>
          </div>
        </div>

        {/* Section title */}
        <div className="medicines-section-header">
          <h3 className="section-title">Prescribed Medications</h3>
          <span className="section-count">{extraction.medicines.length} Medicines</span>
        </div>

        {/* Medicine Cards List */}
        {extraction.medicines.map((med: Medicine, index: number) => {
          const isVerified = med.status === "verified_by_rules";
          const isWarn = med.status === "needs_review";
          const allLineIds = [
            ...med.name.evidence_line_ids,
            ...med.strength.evidence_line_ids,
            ...med.frequency.evidence_line_ids,
          ];
          const isCardHighlighted = allLineIds.some((id) => highlightedLineIds.includes(id));

          return (
            <article
              key={med.id || index}
              className={`medicine-card ${isWarn ? "card-warn" : ""} ${isCardHighlighted ? "card-highlighted" : ""}`}
              onMouseEnter={() => handleLineHover(allLineIds)}
              onMouseLeave={handleLineLeave}
              aria-label={`Medication card: ${med.name.value}`}
            >
              <div className="medicine-header">
                <div className="med-title-group">
                  <h4 className="med-name">{med.name.value}</h4>
                  <span className="med-strength">{med.strength.value}</span>
                </div>

                {/* Status Chips per docs/design.md */}
                {isVerified && (
                  <span className="status-chip status-verified" title="Verified against OCR text">
                    <CheckCircle size={15} weight="bold" />
                    <span>Matches the text</span>
                  </span>
                )}
                {isWarn && (
                  <span className="status-chip status-warn" title="Requires human review">
                    <Warning size={15} weight="bold" />
                    <span>Needs your check</span>
                  </span>
                )}
                {!isVerified && !isWarn && (
                  <span className="status-chip status-missing">
                    <Question size={15} weight="bold" />
                    <span>Could not read</span>
                  </span>
                )}
              </div>

              {/* Fields Grid */}
              <div className="med-fields-grid">
                <div
                  className={`field-item ${med.form.evidence_line_ids.some((id) => highlightedLineIds.includes(id)) ? "field-active" : ""}`}
                  onMouseEnter={() => handleLineHover(med.form.evidence_line_ids)}
                  onMouseLeave={handleLineLeave}
                >
                  <span className="field-label">
                    Form
                    {med.form.evidence_line_ids.length > 0 && (
                      <span className="field-evidence-tag">{med.form.evidence_line_ids.join(",")}</span>
                    )}
                  </span>
                  <div className="field-value">{med.form.value}</div>
                </div>

                <div
                  className={`field-item ${med.frequency.evidence_line_ids.some((id) => highlightedLineIds.includes(id)) ? "field-active" : ""}`}
                  onMouseEnter={() => handleLineHover(med.frequency.evidence_line_ids)}
                  onMouseLeave={handleLineLeave}
                >
                  <span className="field-label">
                    Frequency
                    {med.frequency.evidence_line_ids.length > 0 && (
                      <span className="field-evidence-tag">{med.frequency.evidence_line_ids.join(",")}</span>
                    )}
                  </span>
                  <div className="field-value font-mono">{med.frequency.value}</div>
                </div>

                <div
                  className={`field-item ${med.timing.evidence_line_ids.some((id) => highlightedLineIds.includes(id)) ? "field-active" : ""}`}
                  onMouseEnter={() => handleLineHover(med.timing.evidence_line_ids)}
                  onMouseLeave={handleLineLeave}
                >
                  <span className="field-label">
                    Timing
                    {med.timing.evidence_line_ids.length > 0 && (
                      <span className="field-evidence-tag">{med.timing.evidence_line_ids.join(",")}</span>
                    )}
                  </span>
                  <div className="field-value">{med.timing.value}</div>
                </div>

                <div
                  className={`field-item ${med.duration.evidence_line_ids.some((id) => highlightedLineIds.includes(id)) ? "field-active" : ""}`}
                  onMouseEnter={() => handleLineHover(med.duration.evidence_line_ids)}
                  onMouseLeave={handleLineLeave}
                >
                  <span className="field-label">
                    Duration
                    {med.duration.evidence_line_ids.length > 0 && (
                      <span className="field-evidence-tag">{med.duration.evidence_line_ids.join(",")}</span>
                    )}
                  </span>
                  <div className="field-value">{med.duration.value}</div>
                </div>
              </div>

              {/* Instructions line */}
              <div
                className="field-item"
                onMouseEnter={() => handleLineHover(med.instructions.evidence_line_ids)}
                onMouseLeave={handleLineLeave}
              >
                <span className="field-label">Instructions</span>
                <div className="field-value" style={{ fontWeight: 500 }}>
                  {med.instructions.value || "None provided"}
                </div>
              </div>

              {/* Amber Review Box if flagged */}
              {isWarn && (
                <div className="med-warning-box">
                  <div className="warning-message">
                    <Warning size={17} weight="bold" color="var(--warn)" />
                    <span>
                      {med.strength.status === "unclear"
                        ? "Strength is hard to read on original document."
                        : "Field requires patient verification."}
                    </span>
                  </div>
                  {med.suggestions && med.suggestions.length > 0 && (
                    <p style={{ margin: "0.2rem 0 0.4rem 0", fontSize: "0.84rem" }}>
                      Suggested standard: <strong>{med.suggestions[0].suggested_value}</strong> ({med.suggestions[0].reason})
                    </p>
                  )}
                  <label className="ack-checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!acknowledgedMedIds[med.id]}
                      onChange={() => toggleAcknowledge(med.id)}
                    />
                    <span>I confirm I verified this dosage against my physical medicine bottle</span>
                  </label>
                </div>
              )}
            </article>
          );
        })}

        {/* Confirmation & Reminder Action Bar */}
        <div className="review-actions-card">
          <div className="actions-status-text">
            {isConfirmed ? (
              <span style={{ color: "var(--ok)", fontWeight: 600 }}>
                ✓ Prescription verified! Daily medication reminders are scheduled.
              </span>
            ) : flaggedMeds.length > 0 && !allAcknowledged ? (
              <span>Please acknowledge all flagged items to enable reminders.</span>
            ) : (
              <span>All prescription details verified against original source text.</span>
            )}
          </div>

          <button
            className="confirm-prescription-btn"
            disabled={(!allAcknowledged && flaggedMeds.length > 0) || isConfirmed}
            onClick={handleConfirm}
          >
            <span>{isConfirmed ? "Confirmed" : "Confirm & Set Reminders"}</span>
            <ArrowRight size={18} weight="bold" />
          </button>
        </div>
      </section>
    </div>
  );
};
