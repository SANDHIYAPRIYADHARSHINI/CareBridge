import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Sun,
  Moon,
  CloudSun,
  PlusCircle,
  Pill,
  FileText,
  Clock,
  ArrowRight,
  Check,
  CalendarBlank,
} from "@phosphor-icons/react";
import type { ExtractionResult, Medicine } from "../../types/ai";
import "./TodayScreen.css";

interface TodayScreenProps {
  language: "en" | "ta";
  confirmedExtraction: ExtractionResult | null;
  imageUrl?: string;
  onNavigateToAdd: () => void;
  onNavigateToCheck: () => void;
  onLoadSample?: () => void;
}

export const TodayScreen: React.FC<TodayScreenProps> = ({
  language,
  confirmedExtraction,
  imageUrl = "/rx_demo_001.png",
  onNavigateToAdd,
  onNavigateToCheck,
  onLoadSample,
}) => {
  // Determine greeting and date based on current time
  const [initialDate] = useState(() => new Date());
  const initialHour = initialDate.getHours();
  const greetingEn =
    initialHour < 12
      ? "Good morning"
      : initialHour < 18
      ? "Good afternoon"
      : "Good evening";
  const greetingTa =
    initialHour < 12
      ? "காலை வணக்கம்"
      : initialHour < 18
      ? "மதிய வணக்கம்"
      : "மாலை வணக்கம்";
  const greeting = language === "ta" ? greetingTa : greetingEn;

  // Taken pills tracker state (dose key -> boolean)
  const [takenDoses, setTakenDoses] = useState<Record<string, boolean>>({});

  const toggleDose = (doseKey: string) => {
    setTakenDoses((prev) => ({
      ...prev,
      [doseKey]: !prev[doseKey],
    }));
  };

  // Extract pill schedules if confirmedExtraction exists
  const medicines: Medicine[] = confirmedExtraction?.medicines || [];

  const morningMeds = medicines.filter(
    (m: Medicine) =>
      m.frequency.value?.includes("1-") ||
      m.timing.value?.toLowerCase().includes("morning") ||
      m.timing.value?.includes("காலை") ||
      m.frequency.value === "1-0-1" ||
      m.frequency.value === "1-1-1" ||
      m.frequency.value === "1-0-0"
  );

  const afternoonMeds = medicines.filter(
    (m: Medicine) =>
      m.frequency.value?.includes("-1-") ||
      m.timing.value?.toLowerCase().includes("afternoon") ||
      m.timing.value?.includes("மதியம்") ||
      m.frequency.value === "1-1-1" ||
      m.frequency.value === "0-1-0"
  );

  const nightMeds = medicines.filter(
    (m: Medicine) =>
      m.frequency.value?.endsWith("-1") ||
      m.timing.value?.toLowerCase().includes("night") ||
      m.timing.value?.includes("இரவு") ||
      m.frequency.value === "1-0-1" ||
      m.frequency.value === "1-1-1" ||
      m.frequency.value === "0-0-1"
  );

  // Track assigned layoutIds so each medicine connects to exactly one pill chip
  const assignedLayoutIds = new Set<string>();
  const getPillLayoutId = (medId: string): string | undefined => {
    if (!assignedLayoutIds.has(medId)) {
      assignedLayoutIds.add(medId);
      return `med-card-${medId}`;
    }
    return undefined;
  };

  const formatTiming = (timingVal?: string | null) => {
    if (!timingVal) return language === "ta" ? "உணவுக்குப் பின்" : "After food";
    if (language === "ta") {
      if (timingVal.toLowerCase().includes("after")) return "உணவுக்குப் பின்";
      if (timingVal.toLowerCase().includes("before")) return "உணவுக்கு முன்";
      return timingVal;
    }
    return timingVal;
  };

  return (
    <div className="today-container">
      {/* Calm Patient Greeting */}
      <header className="today-header">
        <h1 className="today-greeting">{greeting}</h1>
        <p className="today-subtitle">
          {language === "ta"
            ? "உங்கள் மருந்துகள் மற்றும் அன்றாட பராமரிப்பு திட்டம் இங்கே உள்ளது."
            : "Here is your medication schedule and care plan for today."}
        </p>
      </header>

      {/* Your Day Ribbon */}
      <section className="day-ribbon-card" aria-label="Today Medication Ribbon">
        <div className="ribbon-header">
          <div className="ribbon-title-wrap">
            <Clock size={20} color="var(--primary)" weight="bold" />
            <h2 className="ribbon-title">
              {language === "ta" ? "இன்றைய அட்டவணை" : "Your day ribbon"}
            </h2>
          </div>
          <span className="ribbon-date-chip font-tabular">
            <CalendarBlank size={14} />
            {initialDate.toLocaleDateString(language === "ta" ? "ta-IN" : "en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        <div className="ribbon-grid">
          {/* Morning Slot */}
          <div className="time-slot-column">
            <div className="slot-badge morning">
              <div className="slot-badge-left">
                <Sun size={18} weight="bold" />
                <span>{language === "ta" ? "காலை" : "Morning"}</span>
              </div>
              <span className="slot-time font-tabular">8:00 AM</span>
            </div>
            <div className="slot-pills">
              {morningMeds.length > 0 ? (
                morningMeds.map((med: Medicine, idx: number) => {
                  const doseKey = `morning-${med.id || idx}`;
                  const isTaken = !!takenDoses[doseKey];
                  const layoutId = getPillLayoutId(med.id);
                  return (
                    <motion.div
                      key={doseKey}
                      layoutId={layoutId}
                      className={`pill-chip ${isTaken ? "pill-chip-taken" : ""}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <button
                        type="button"
                        className={`pill-check-btn ${isTaken ? "checked" : ""}`}
                        onClick={() => toggleDose(doseKey)}
                        aria-label={
                          isTaken
                            ? `${med.name.value} taken`
                            : `Mark ${med.name.value} as taken`
                        }
                      >
                        {isTaken ? (
                          <Check size={12} weight="bold" />
                        ) : (
                          <Pill size={14} weight="bold" />
                        )}
                      </button>
                      <div className="pill-chip-body">
                        <div className="pill-name-row">
                          <span className="pill-name">{med.name.value}</span>
                          {med.strength.value && (
                            <span className="pill-strength font-tabular">
                              {med.strength.value}
                            </span>
                          )}
                        </div>
                        <div className="pill-meta-row">
                          <span className="pill-timing">
                            {formatTiming(med.timing.value)}
                          </span>
                          <span className="pill-status-label">
                            {isTaken
                              ? language === "ta"
                                ? "எடுக்கப்பட்டது"
                                : "Taken"
                              : language === "ta"
                              ? "நிலுவையில்"
                              : "Scheduled"}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="empty-slot-indicator">
                  <Check size={14} weight="bold" color="var(--primary)" />
                  <span>
                    {language === "ta" ? "மருந்துகள் இல்லை" : "All clear, no doses"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Afternoon Slot */}
          <div className="time-slot-column">
            <div className="slot-badge afternoon">
              <div className="slot-badge-left">
                <CloudSun size={18} weight="bold" />
                <span>{language === "ta" ? "மதியம்" : "Afternoon"}</span>
              </div>
              <span className="slot-time font-tabular">1:00 PM</span>
            </div>
            <div className="slot-pills">
              {afternoonMeds.length > 0 ? (
                afternoonMeds.map((med: Medicine, idx: number) => {
                  const doseKey = `afternoon-${med.id || idx}`;
                  const isTaken = !!takenDoses[doseKey];
                  const layoutId = getPillLayoutId(med.id);
                  return (
                    <motion.div
                      key={doseKey}
                      layoutId={layoutId}
                      className={`pill-chip ${isTaken ? "pill-chip-taken" : ""}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <button
                        type="button"
                        className={`pill-check-btn ${isTaken ? "checked" : ""}`}
                        onClick={() => toggleDose(doseKey)}
                        aria-label={
                          isTaken
                            ? `${med.name.value} taken`
                            : `Mark ${med.name.value} as taken`
                        }
                      >
                        {isTaken ? (
                          <Check size={12} weight="bold" />
                        ) : (
                          <Pill size={14} weight="bold" />
                        )}
                      </button>
                      <div className="pill-chip-body">
                        <div className="pill-name-row">
                          <span className="pill-name">{med.name.value}</span>
                          {med.strength.value && (
                            <span className="pill-strength font-tabular">
                              {med.strength.value}
                            </span>
                          )}
                        </div>
                        <div className="pill-meta-row">
                          <span className="pill-timing">
                            {formatTiming(med.timing.value)}
                          </span>
                          <span className="pill-status-label">
                            {isTaken
                              ? language === "ta"
                                ? "எடுக்கப்பட்டது"
                                : "Taken"
                              : language === "ta"
                              ? "நிலுவையில்"
                              : "Scheduled"}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="empty-slot-indicator">
                  <Check size={14} weight="bold" color="var(--primary)" />
                  <span>
                    {language === "ta" ? "மருந்துகள் இல்லை" : "All clear, no doses"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Night Slot */}
          <div className="time-slot-column">
            <div className="slot-badge night">
              <div className="slot-badge-left">
                <Moon size={18} weight="bold" />
                <span>{language === "ta" ? "இரவு" : "Night"}</span>
              </div>
              <span className="slot-time font-tabular">8:00 PM</span>
            </div>
            <div className="slot-pills">
              {nightMeds.length > 0 ? (
                nightMeds.map((med: Medicine, idx: number) => {
                  const doseKey = `night-${med.id || idx}`;
                  const isTaken = !!takenDoses[doseKey];
                  const layoutId = getPillLayoutId(med.id);
                  return (
                    <motion.div
                      key={doseKey}
                      layoutId={layoutId}
                      className={`pill-chip ${isTaken ? "pill-chip-taken" : ""}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <button
                        type="button"
                        className={`pill-check-btn ${isTaken ? "checked" : ""}`}
                        onClick={() => toggleDose(doseKey)}
                        aria-label={
                          isTaken
                            ? `${med.name.value} taken`
                            : `Mark ${med.name.value} as taken`
                        }
                      >
                        {isTaken ? (
                          <Check size={12} weight="bold" />
                        ) : (
                          <Pill size={14} weight="bold" />
                        )}
                      </button>
                      <div className="pill-chip-body">
                        <div className="pill-name-row">
                          <span className="pill-name">{med.name.value}</span>
                          {med.strength.value && (
                            <span className="pill-strength font-tabular">
                              {med.strength.value}
                            </span>
                          )}
                        </div>
                        <div className="pill-meta-row">
                          <span className="pill-timing">
                            {formatTiming(med.timing.value)}
                          </span>
                          <span className="pill-status-label">
                            {isTaken
                              ? language === "ta"
                                ? "எடுக்கப்பட்டது"
                                : "Taken"
                              : language === "ta"
                              ? "நிலுவையில்"
                              : "Scheduled"}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="empty-slot-indicator">
                  <Check size={14} weight="bold" color="var(--primary)" />
                  <span>
                    {language === "ta" ? "மருந்துகள் இல்லை" : "All clear, no doses"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Empty state prompt if no prescription confirmed yet */}
        {medicines.length === 0 && (
          <div className="ribbon-empty-banner">
            <p className="ribbon-empty-text">
              {language === "ta"
                ? "இன்னும் மருந்துச் சீட்டு எதுவும் சேர்க்கப்படவில்லை. அட்டவணையை உருவாக்க உங்கள் மருந்துச் சீட்டைச் சேர்க்கவும் அல்லது மாதிரியை ஏற்றவும்."
                : "No medications scheduled yet. Add your prescription to populate your daily ribbon."}
            </p>
            {onLoadSample && (
              <button
                type="button"
                className="load-sample-btn"
                onClick={onLoadSample}
              >
                {language === "ta" ? "மாதிரி மருந்துச் சீட்டை ஏற்று" : "Load sample schedule"}
              </button>
            )}
          </div>
        )}

        {confirmedExtraction && (
          <div className="ribbon-footer-action">
            <button
              type="button"
              className="view-rx-button"
              onClick={onNavigateToCheck}
            >
              <FileText size={16} />
              <span>
                {language === "ta" ? "மருந்துச் சீட்டை சரிபார்" : "View paper & check"}
              </span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </section>

      {/* Recent Documents Section */}
      <section className="recent-docs-section" aria-label="Recent documents">
        <div className="section-title-row">
          <h2 className="section-title">
            {language === "ta" ? "சமீபத்திய ஆவணங்கள்" : "Recent documents"}
          </h2>
          <span className="section-subtitle">
            {language === "ta"
              ? "சரிபார்க்கப்பட்ட மருந்துச் சீட்டுகள்"
              : "Prescriptions verified against paper text"}
          </span>
        </div>

        <div className="recent-docs-grid">
          <article className="recent-doc-card">
            <div className="doc-thumbnail-wrap" onClick={onNavigateToCheck}>
              <img
                src={imageUrl}
                alt="Prescription document thumbnail"
                className="doc-thumbnail-img"
              />
              <div className="doc-thumbnail-overlay">
                <FileText size={20} color="#FFFFFF" weight="bold" />
              </div>
            </div>

            <div className="doc-details">
              <div className="doc-header">
                <h3 className="doc-hospital-name">
                  {confirmedExtraction?.prescriber?.hospital?.value ||
                    "Apollo Speciality Hospitals"}
                </h3>
                <span className="doc-date font-tabular">
                  {confirmedExtraction?.prescriber?.date?.value || "14/10/2026"}
                </span>
              </div>

              <div className="doc-physician">
                {confirmedExtraction?.prescriber?.name?.value ||
                  "Dr. A. Sundaram, MD (Gen Med)"}
              </div>

              <div className="doc-tags">
                <span className="doc-tag verified-tag">
                  <Check size={13} weight="bold" />
                  <span>
                    {confirmedExtraction
                      ? `${medicines.length} ${
                          language === "ta" ? "மருந்துகள் சரிபார்க்கப்பட்டது" : "medicines verified"
                        }`
                      : language === "ta"
                      ? "4 மருந்துகள் சரிபார்க்கப்பட்டது"
                      : "4 medicines verified"}
                  </span>
                </span>
                <span className="doc-tag line-tag font-tabular">
                  {language === "ta" ? "வரிகளுடன் இணைக்கப்பட்டது" : "Evidence lines mapped"}
                </span>
              </div>
            </div>

            <div className="doc-action">
              <button
                type="button"
                className="doc-review-btn"
                onClick={onNavigateToCheck}
              >
                <span>{language === "ta" ? "சரிபார்" : "Review paper"}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </article>
        </div>
      </section>

      {/* Quiet "Add a prescription" Action Card */}
      <section
        className="add-action-card"
        onClick={onNavigateToAdd}
        role="button"
        tabIndex={0}
        aria-label="Add a new prescription"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onNavigateToAdd();
          }
        }}
      >
        <div className="add-action-content">
          <div className="add-icon-circle">
            <PlusCircle size={28} color="var(--primary)" weight="bold" />
          </div>
          <div className="add-action-copy">
            <h3 className="add-card-title">
              {language === "ta" ? "புதிய மருந்துச் சீட்டைச் சேர்க்க" : "Add a prescription"}
            </h3>
            <p className="add-card-sub">
              {language === "ta"
                ? "உங்கள் மருந்துச் சீட்டைப் படம் எடுத்து விவரங்களைச் சரிபாருங்கள்."
                : "Add a photo. We show what it says, where we found it, and what to double-check."}
            </p>
          </div>
        </div>
        <button type="button" className="add-card-cta" tabIndex={-1}>
          {language === "ta" ? "சேர்க்க" : "Add a prescription"}
        </button>
      </section>
    </div>
  );
};

export default TodayScreen;
