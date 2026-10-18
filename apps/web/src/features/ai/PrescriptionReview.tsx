import React, { useState, useRef, useEffect, useCallback } from "react";
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
  X,
  FileText,
  HandGrabbing,
} from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import type { ExtractionResult, Medicine } from "../../types/ai";
import "./PrescriptionReview.css";

interface PrescriptionReviewProps {
  extraction: ExtractionResult;
  imageUrl?: string;
  useFixtures?: boolean;
  onHoverLine?: (lineIds: string[]) => void;
  onConfirmReminders?: () => void;
  onReUpload?: () => void;
  language?: string;
}

type ZoomStep = 1.0 | 1.25 | 1.5 | 2.0;
const ZOOM_STEPS: ZoomStep[] = [1.0, 1.25, 1.5, 2.0];

interface LeaderLineCoords {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const PrescriptionReview: React.FC<PrescriptionReviewProps> = ({
  extraction,
  imageUrl = "/rx_demo_001.png",
  useFixtures: _useFixtures = false,
  onHoverLine,
  onConfirmReminders,
  onReUpload,
  language = "en",
}) => {
  // Zoom & Pan state
  const [zoomStep, setZoomStep] = useState<ZoomStep>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Natural image dimensions for percentage calculation
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({
    width: extraction.image?.width || 1200,
    height: extraction.image?.height || 1600,
  });

  // Hover state
  const [highlightedLineIds, setHighlightedLineIds] = useState<string[]>([]);
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);

  // Leader line coordinates
  const [leaderLine, setLeaderLine] = useState<LeaderLineCoords | null>(null);

  // Acknowledgement state for flagged medicines
  const [acknowledgedMedIds, setAcknowledgedMedIds] = useState<Record<string, boolean>>({});
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Mobile paper sheet modal
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  // Container refs
  const layoutRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeFieldRef = useRef<HTMLElement | null>(null);

  // Flagged items calculation
  const flaggedMeds = extraction.medicines.filter((m) => m.status === "needs_review");
  const totalFlagged = flaggedMeds.length;
  const acknowledgedCount = flaggedMeds.filter((m) => acknowledgedMedIds[m.id]).length;
  const allAcknowledged = totalFlagged === 0 || acknowledgedCount >= totalFlagged;

  // Zoom handlers (relative steps)
  const handleZoomIn = () => {
    setZoomStep((prev) => {
      const idx = ZOOM_STEPS.indexOf(prev);
      return idx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[idx + 1] : prev;
    });
  };

  const handleZoomOut = () => {
    setZoomStep((prev) => {
      const idx = ZOOM_STEPS.indexOf(prev);
      const next = idx > 0 ? ZOOM_STEPS[idx - 1] : prev;
      if (next === 1.0) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleZoomFit = () => {
    setZoomStep(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  // Drag to pan handlers when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomStep <= 1.0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panOffset };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomStep <= 1.0) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoomStep <= 1.0 || e.touches.length !== 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    panStartRef.current = { ...panOffset };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || zoomStep <= 1.0 || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStartRef.current.x;
    const dy = e.touches[0].clientY - dragStartRef.current.y;
    setPanOffset({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  // Compute leader line between active field and first matching highlighted paper line
  const updateLeaderLine = useCallback(() => {
    if (!layoutRef.current || highlightedLineIds.length === 0 || !activeFieldRef.current) {
      setLeaderLine(null);
      return;
    }

    const firstLineId = highlightedLineIds[0];
    const lineEl = document.getElementById(`ocr-line-${firstLineId}`);
    if (!lineEl || !activeFieldRef.current) {
      setLeaderLine(null);
      return;
    }

    const containerRect = layoutRef.current.getBoundingClientRect();
    const fieldRect = activeFieldRef.current.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();

    // Check if on desktop (side by side layout)
    if (window.innerWidth < 992) {
      setLeaderLine(null);
      return;
    }

    // Start at the left-center of the active field card
    const startX = fieldRect.left - containerRect.left;
    const startY = fieldRect.top + fieldRect.height / 2 - containerRect.top;

    // End at the right-center of the paper highlight line
    const endX = lineRect.right - containerRect.left;
    const endY = lineRect.top + lineRect.height / 2 - containerRect.top;

    setLeaderLine({ startX, startY, endX, endY });
  }, [highlightedLineIds]);

  // Recompute leader line on scroll, zoom, or resize
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      updateLeaderLine();
    });
    window.addEventListener("resize", updateLeaderLine);
    window.addEventListener("scroll", updateLeaderLine, true);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateLeaderLine);
      window.removeEventListener("scroll", updateLeaderLine, true);
    };
  }, [updateLeaderLine, zoomStep, panOffset]);

  // Field hover and focus handlers
  const handleFieldHover = (
    fieldKey: string,
    lineIds: string[],
    element: HTMLElement | null
  ) => {
    setActiveFieldKey(fieldKey);
    setHighlightedLineIds(lineIds);
    activeFieldRef.current = element;
    if (onHoverLine) onHoverLine(lineIds);
  };

  const handleFieldLeave = () => {
    setActiveFieldKey(null);
    setHighlightedLineIds([]);
    activeFieldRef.current = null;
    setLeaderLine(null);
    if (onHoverLine) onHoverLine([]);
  };

  const toggleAcknowledge = (medId: string) => {
    setAcknowledgedMedIds((prev) => ({
      ...prev,
      [medId]: !prev[medId],
    }));
  };

  const handleConfirm = () => {
    if (!allAcknowledged) return;
    setIsConfirmed(true);
    if (onConfirmReminders) onConfirmReminders();
  };

  // Render the core Paper Document Viewer
  const renderDocumentViewer = (isSheet = false) => {
    const isZoomed = zoomStep > 1.0;

    return (
      <div className={`doc-viewer-panel ${isSheet ? "sheet-mode" : ""}`}>
        {/* Toolbar */}
        <div className="doc-viewer-toolbar">
          <div className="doc-viewer-title">
            <ShieldCheck size={18} color="var(--primary)" weight="bold" />
            <span>{language === "ta" ? "அசல் மருந்துச் சீட்டு" : "Original paper"}</span>
          </div>

          <div className="doc-viewer-controls">
            {/* Fit button */}
            <button
              type="button"
              className={`zoom-btn fit-btn ${zoomStep === 1.0 ? "active" : ""}`}
              onClick={handleZoomFit}
              title="Fit to width"
            >
              Fit
            </button>

            {/* Zoom Out */}
            <button
              type="button"
              className="zoom-btn"
              onClick={handleZoomOut}
              disabled={zoomStep <= 1.0}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <MagnifyingGlassMinus size={15} />
            </button>

            {/* Current Zoom Step */}
            <span className="zoom-level-text font-tabular">
              {Math.round(zoomStep * 100)}%
            </span>

            {/* Zoom In */}
            <button
              type="button"
              className="zoom-btn"
              onClick={handleZoomIn}
              disabled={zoomStep >= 2.0}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <MagnifyingGlassPlus size={15} />
            </button>

            {/* Reset */}
            <button
              type="button"
              className="zoom-btn"
              onClick={handleZoomFit}
              title="Reset view"
              aria-label="Reset view position"
            >
              <ArrowsCounterClockwise size={15} />
            </button>

            {/* Re-upload on desktop */}
            {!isSheet && onReUpload && (
              <button
                type="button"
                className="zoom-btn new-rx-btn"
                onClick={onReUpload}
                title="Upload another prescription"
              >
                <UploadSimple size={14} />
                <span>New</span>
              </button>
            )}

            {/* Close sheet on mobile */}
            {isSheet && (
              <button
                type="button"
                className="close-sheet-btn"
                onClick={() => setIsMobileSheetOpen(false)}
                title="Close paper view"
                aria-label="Close paper view"
              >
                <X size={18} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {/* Viewport with Drag-to-Pan */}
        <div
          ref={viewportRef}
          className={`doc-viewer-viewport ${isZoomed ? "can-pan" : ""} ${isDragging ? "is-panning" : ""}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
        >
          <div
            className="doc-render-container"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomStep})`,
              transformOrigin: "top left",
            }}
          >
            <div className="doc-image-wrapper">
              {/* Prescription Image */}
              <img
                src={imageUrl}
                alt="Prescription document"
                className="rx-source-image"
                onLoad={(e) => {
                  setNaturalDimensions({
                    width: e.currentTarget.naturalWidth || 1200,
                    height: e.currentTarget.naturalHeight || 1600,
                  });
                }}
              />

              {/* Highlighter Swipes Layer (Percentages based on natural dimensions) */}
              <div className="highlighter-overlay-layer" aria-hidden="true">
                {extraction.ocr.lines.map((line) => {
                  const [x, y, w, h] = line.bbox;
                  const isHighlighted = highlightedLineIds.includes(line.id);
                  const leftPct = (x / naturalDimensions.width) * 100;
                  const topPct = (y / naturalDimensions.height) * 100;
                  const widthPct = (w / naturalDimensions.width) * 100;
                  const heightPct = (h / naturalDimensions.height) * 100;

                  return (
                    <div
                      key={line.id}
                      id={`ocr-line-${line.id}`}
                      className={`highlighter-swipe ${isHighlighted ? "active" : ""}`}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${widthPct}%`,
                        height: `${heightPct}%`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Legend / Status */}
        <div className="doc-viewer-legend">
          <div className="legend-chip">
            <span className="legend-swatch"></span>
            <span>
              {language === "ta"
                ? "விவரங்களைத் தொடவும்: மூலப் பகுதியில் மஞ்சள் குறியீடு தோன்றும்"
                : "Hover a detail to see its highlighter pen swipe on the paper"}
            </span>
          </div>
          {isZoomed && (
            <div className="pan-hint font-tabular">
              <HandGrabbing size={13} />
              <span>Drag to pan</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={layoutRef}
      className="prescription-review-layout"
      aria-label="Prescription verification interface"
    >
      {/* Dynamic SVG Leader Line Overlay */}
      {leaderLine && (
        <svg className="leader-line-svg" aria-hidden="true">
          <motion.path
            className="leader-line-path"
            d={`M ${leaderLine.startX} ${leaderLine.startY} C ${leaderLine.startX - 45} ${leaderLine.startY}, ${leaderLine.endX + 45} ${leaderLine.endY}, ${leaderLine.endX} ${leaderLine.endY}`}
            stroke="var(--primary)"
            strokeWidth="1.75"
            strokeDasharray="4 3"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
          <circle
            cx={leaderLine.startX}
            cy={leaderLine.startY}
            r="3.5"
            fill="var(--primary)"
          />
          <circle
            cx={leaderLine.endX}
            cy={leaderLine.endY}
            r="3.5"
            fill="var(--highlighter)"
            stroke="var(--primary)"
            strokeWidth="1.5"
          />
        </svg>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Left Column (Desktop Sticky): Document Viewer                      */}
      {/* ------------------------------------------------------------------ */}
      <section className="desktop-doc-column" aria-label="Original prescription paper">
        {renderDocumentViewer(false)}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Right Column: Prescriber metadata and Extracted Medicine Cards     */}
      {/* ------------------------------------------------------------------ */}
      <section className="cards-column" aria-label="Extracted medication cards">
        {/* Mobile View Paper Button */}
        <div className="mobile-view-paper-bar">
          <button
            type="button"
            className="view-original-paper-btn"
            onClick={() => setIsMobileSheetOpen(true)}
          >
            <FileText size={18} weight="bold" color="var(--primary)" />
            <span>{language === "ta" ? "அசல் மருந்துச் சீட்டைப் பார்க்க" : "View original prescription paper"}</span>
            <span className="mobile-pill-badge">{extraction.medicines.length} meds</span>
          </button>
        </div>

        {/* Prescriber & Patient Metadata Card */}
        <div className="prescriber-card">
          <div className="prescriber-header">
            <div>
              <h2 className="hospital-name">{extraction.prescriber.hospital.value}</h2>
              <div className="doctor-name">{extraction.prescriber.name.value}</div>
            </div>
            {extraction.prescriber.registration_no.value && (
              <span className="reg-badge font-tabular">
                {extraction.prescriber.registration_no.value}
              </span>
            )}
          </div>

          <div className="patient-meta-grid">
            <div className="meta-cell">
              <span className="meta-label">{language === "ta" ? "நோயாளி" : "Patient"}</span>
              <div className="meta-value">{extraction.patient.name.value}</div>
            </div>
            <div className="meta-cell">
              <span className="meta-label">{language === "ta" ? "வயது" : "Age"}</span>
              <div className="meta-value font-tabular">{extraction.patient.age.value} Years</div>
            </div>
            <div className="meta-cell">
              <span className="meta-label">{language === "ta" ? "தேதி" : "Prescribed Date"}</span>
              <div className="meta-value font-tabular">{extraction.prescriber.date.value}</div>
            </div>
            {extraction.follow_up.value && (
              <div className="meta-cell">
                <span className="meta-label">{language === "ta" ? "அடுத்த சந்திப்பு" : "Follow-Up"}</span>
                <div className="meta-value">{extraction.follow_up.value}</div>
              </div>
            )}
          </div>
        </div>

        {/* Section title */}
        <div className="medicines-section-header">
          <h3 className="section-title">
            {language === "ta" ? "பரிந்துரைக்கப்பட்ட மருந்துகள்" : "Prescribed Medications"}
          </h3>
          <span className="section-count font-tabular">
            {extraction.medicines.length} {language === "ta" ? "மருந்துகள்" : "Medicines"}
          </span>
        </div>

        {/* Medicine Cards List with Stagger Entrance */}
        <div className="medicine-cards-stack">
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
              <motion.article
                key={med.id || index}
                layoutId={`med-card-${med.id}`}
                className={`medicine-card ${isWarn ? "card-warn" : ""} ${isCardHighlighted ? "card-highlighted" : ""}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.32, ease: "easeOut" }}
                aria-label={`Medication: ${med.name.value}`}
              >
                {/* Header */}
                <div className="medicine-header">
                  <div className="med-title-group">
                    <h4 className="med-name">{med.name.value}</h4>
                    {med.strength.value && (
                      <span className="med-strength font-tabular">{med.strength.value}</span>
                    )}
                  </div>

                  {/* Status chip */}
                  {isVerified && (
                    <span className="status-chip status-verified">
                      <CheckCircle size={15} weight="bold" />
                      <span>{language === "ta" ? "உரையில் பொருந்துகிறது" : "Matches the text"}</span>
                    </span>
                  )}
                  {isWarn && (
                    <span className="status-chip status-warn">
                      <Warning size={15} weight="bold" />
                      <span>{language === "ta" ? "சரிபார்க்கவும்" : "Needs your check"}</span>
                    </span>
                  )}
                  {!isVerified && !isWarn && (
                    <span className="status-chip status-missing">
                      <Question size={15} weight="bold" />
                      <span>{language === "ta" ? "படிக்க முடியவில்லை" : "Could not read"}</span>
                    </span>
                  )}
                </div>

                {/* Fields Grid */}
                <div className="med-fields-grid">
                  {/* Name Field */}
                  <div
                    ref={(el) => {
                      if (activeFieldKey === `med-${med.id}-name`) activeFieldRef.current = el;
                    }}
                    className={`field-item ${activeFieldKey === `med-${med.id}-name` ? "field-active" : ""}`}
                    onMouseEnter={(e) => handleFieldHover(`med-${med.id}-name`, med.name.evidence_line_ids, e.currentTarget)}
                    onMouseLeave={handleFieldLeave}
                    onFocus={(e) => handleFieldHover(`med-${med.id}-name`, med.name.evidence_line_ids, e.currentTarget)}
                    onBlur={handleFieldLeave}
                    tabIndex={0}
                  >
                    <div className="field-header">
                      <span className="field-label">{language === "ta" ? "மருந்து பெயர்" : "Medicine"}</span>
                      {med.name.evidence_line_ids.length > 0 && (
                        <span className="line-evidence-chip font-tabular">
                          Line {med.name.evidence_line_ids.map((id) => id.replace(/^L/, "")).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="field-value ink-style-verified">{med.name.value}</div>
                  </div>

                  {/* Strength Field */}
                  <div
                    ref={(el) => {
                      if (activeFieldKey === `med-${med.id}-strength`) activeFieldRef.current = el;
                    }}
                    className={`field-item ${activeFieldKey === `med-${med.id}-strength` ? "field-active" : ""}`}
                    onMouseEnter={(e) => handleFieldHover(`med-${med.id}-strength`, med.strength.evidence_line_ids, e.currentTarget)}
                    onMouseLeave={handleFieldLeave}
                    onFocus={(e) => handleFieldHover(`med-${med.id}-strength`, med.strength.evidence_line_ids, e.currentTarget)}
                    onBlur={handleFieldLeave}
                    tabIndex={0}
                  >
                    <div className="field-header">
                      <span className="field-label">{language === "ta" ? "அளவு" : "Strength"}</span>
                      {med.strength.evidence_line_ids.length > 0 && (
                        <span className="line-evidence-chip font-tabular">
                          Line {med.strength.evidence_line_ids.map((id) => id.replace(/^L/, "")).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className={`field-value font-tabular ${med.strength.status === "unclear" ? "ink-style-warn" : "ink-style-verified"}`}>
                      {med.strength.value || "---"}
                    </div>
                  </div>

                  {/* Frequency Field */}
                  <div
                    ref={(el) => {
                      if (activeFieldKey === `med-${med.id}-frequency`) activeFieldRef.current = el;
                    }}
                    className={`field-item ${activeFieldKey === `med-${med.id}-frequency` ? "field-active" : ""}`}
                    onMouseEnter={(e) => handleFieldHover(`med-${med.id}-frequency`, med.frequency.evidence_line_ids, e.currentTarget)}
                    onMouseLeave={handleFieldLeave}
                    onFocus={(e) => handleFieldHover(`med-${med.id}-frequency`, med.frequency.evidence_line_ids, e.currentTarget)}
                    onBlur={handleFieldLeave}
                    tabIndex={0}
                  >
                    <div className="field-header">
                      <span className="field-label">{language === "ta" ? "அதிர்வெண்" : "Frequency"}</span>
                      {med.frequency.evidence_line_ids.length > 0 && (
                        <span className="line-evidence-chip font-tabular">
                          Line {med.frequency.evidence_line_ids.map((id) => id.replace(/^L/, "")).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="field-value font-tabular ink-style-verified">{med.frequency.value}</div>
                  </div>

                  {/* Timing Field */}
                  <div
                    ref={(el) => {
                      if (activeFieldKey === `med-${med.id}-timing`) activeFieldRef.current = el;
                    }}
                    className={`field-item ${activeFieldKey === `med-${med.id}-timing` ? "field-active" : ""}`}
                    onMouseEnter={(e) => handleFieldHover(`med-${med.id}-timing`, med.timing.evidence_line_ids, e.currentTarget)}
                    onMouseLeave={handleFieldLeave}
                    onFocus={(e) => handleFieldHover(`med-${med.id}-timing`, med.timing.evidence_line_ids, e.currentTarget)}
                    onBlur={handleFieldLeave}
                    tabIndex={0}
                  >
                    <div className="field-header">
                      <span className="field-label">{language === "ta" ? "நேரம்" : "Timing"}</span>
                      {med.timing.evidence_line_ids.length > 0 && (
                        <span className="line-evidence-chip font-tabular">
                          Line {med.timing.evidence_line_ids.map((id) => id.replace(/^L/, "")).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="field-value ink-style-verified">{med.timing.value}</div>
                  </div>

                  {/* Duration Field */}
                  <div
                    ref={(el) => {
                      if (activeFieldKey === `med-${med.id}-duration`) activeFieldRef.current = el;
                    }}
                    className={`field-item ${activeFieldKey === `med-${med.id}-duration` ? "field-active" : ""}`}
                    onMouseEnter={(e) => handleFieldHover(`med-${med.id}-duration`, med.duration.evidence_line_ids, e.currentTarget)}
                    onMouseLeave={handleFieldLeave}
                    onFocus={(e) => handleFieldHover(`med-${med.id}-duration`, med.duration.evidence_line_ids, e.currentTarget)}
                    onBlur={handleFieldLeave}
                    tabIndex={0}
                  >
                    <div className="field-header">
                      <span className="field-label">{language === "ta" ? "கால அளவு" : "Duration"}</span>
                      {med.duration.evidence_line_ids.length > 0 && (
                        <span className="line-evidence-chip font-tabular">
                          Line {med.duration.evidence_line_ids.map((id) => id.replace(/^L/, "")).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="field-value font-tabular ink-style-verified">{med.duration.value}</div>
                  </div>

                  {/* Instructions Field */}
                  <div
                    ref={(el) => {
                      if (activeFieldKey === `med-${med.id}-instructions`) activeFieldRef.current = el;
                    }}
                    className={`field-item ${activeFieldKey === `med-${med.id}-instructions` ? "field-active" : ""}`}
                    onMouseEnter={(e) => handleFieldHover(`med-${med.id}-instructions`, med.instructions.evidence_line_ids, e.currentTarget)}
                    onMouseLeave={handleFieldLeave}
                    onFocus={(e) => handleFieldHover(`med-${med.id}-instructions`, med.instructions.evidence_line_ids, e.currentTarget)}
                    onBlur={handleFieldLeave}
                    tabIndex={0}
                  >
                    <div className="field-header">
                      <span className="field-label">{language === "ta" ? "வழிமுறைகள்" : "Instructions"}</span>
                      {med.instructions.evidence_line_ids.length > 0 && (
                        <span className="line-evidence-chip font-tabular">
                          Line {med.instructions.evidence_line_ids.map((id) => id.replace(/^L/, "")).join(", ")}
                        </span>
                      )}
                    </div>
                    <div className="field-value ink-style-verified">
                      {med.instructions.value || "None provided"}
                    </div>
                  </div>
                </div>

                {/* Amber Review Box if flagged */}
                {isWarn && (
                  <div className="med-warning-box">
                    <div className="warning-message">
                      <Warning size={16} weight="bold" color="var(--warn)" />
                      <span>
                        {med.strength.status === "unclear"
                          ? language === "ta" ? "மருந்தின் அளவு தெளிவாக படிக்க முடியவில்லை." : "Strength is hard to read on original document."
                          : language === "ta" ? "விவரங்கள் நோயாளி சரிபார்ப்பு தேவை." : "Field requires patient double-check."}
                      </span>
                    </div>

                    {med.suggestions && med.suggestions.length > 0 && (
                      <p className="suggested-standard-text">
                        Suggested standard: <strong>{med.suggestions[0].suggested_value}</strong> ({med.suggestions[0].reason})
                      </p>
                    )}

                    <label className="ack-checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!acknowledgedMedIds[med.id]}
                        onChange={() => toggleAcknowledge(med.id)}
                      />
                      <span>
                        {language === "ta"
                          ? "எனது மருந்து பாட்டிலுடன் இந்த அளவைச் சரிபார்த்ததை உறுதிப்படுத்துகிறேன்"
                          : "I confirm I verified this dosage against my physical medicine bottle"}
                      </span>
                    </label>
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Sticky Confirm Bar with Live Counter (1 of 2 checked)               */}
        {/* ------------------------------------------------------------------ */}
        <div className="sticky-confirm-bar">
          <div className="confirm-bar-status">
            {totalFlagged > 0 && !allAcknowledged ? (
              <div className="confirm-status-group">
                <span className="counter-pill warn font-tabular">
                  {acknowledgedCount} of {totalFlagged} checked
                </span>
                <span className="confirm-hint-text">
                  {language === "ta"
                    ? `தொடர ${totalFlagged - acknowledgedCount} கொடியிடப்பட்ட உருப்படியைச் சரிபார்க்கவும்`
                    : `Check ${totalFlagged - acknowledgedCount} flagged item${totalFlagged - acknowledgedCount > 1 ? "s" : ""} to continue`}
                </span>
              </div>
            ) : (
              <div className="confirm-status-group">
                <span className="counter-pill ok font-tabular">
                  {totalFlagged > 0 ? `${totalFlagged} of ${totalFlagged} checked` : "Verified"}
                </span>
                <span className="confirm-hint-text">
                  {language === "ta"
                    ? "அனைத்து மருந்து விவரங்களும் மூல உரையுடன் சரிபார்க்கப்பட்டன."
                    : "All prescription details verified against original source text."}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="confirm-bar-button"
            disabled={!allAcknowledged || isConfirmed}
            onClick={handleConfirm}
          >
            <span>
              {isConfirmed
                ? language === "ta" ? "உறுதிப்படுத்தப்பட்டது" : "Confirmed"
                : language === "ta" ? "உறுதிசெய்து தொடர்க" : "Confirm & Set Reminders"}
            </span>
            <ArrowRight size={17} weight="bold" />
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile Full-Screen Paper Sheet Modal                               */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {isMobileSheetOpen && (
          <div className="mobile-paper-sheet-overlay" role="dialog" aria-modal="true">
            <motion.div
              className="mobile-sheet-content"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
            >
              {renderDocumentViewer(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
