import React from "react";
import {
  Sun,
  Moon,
  CloudSun,
  PlusCircle,
  Pill,
  FileText,
  Clock,
  ArrowRight,
} from "@phosphor-icons/react";
import type { ExtractionResult, Medicine } from "../../types/ai";
import "./TodayScreen.css";

interface TodayScreenProps {
  language: "en" | "ta";
  confirmedExtraction: ExtractionResult | null;
  onNavigateToAdd: () => void;
  onNavigateToCheck: () => void;
}

export const TodayScreen: React.FC<TodayScreenProps> = ({
  language,
  confirmedExtraction,
  onNavigateToAdd,
  onNavigateToCheck,
}) => {
  // Determine greeting based on current time
  const [initialHour] = React.useState(() => new Date().getHours());
  const greetingEn = initialHour < 12 ? "Good morning" : initialHour < 18 ? "Good afternoon" : "Good evening";
  const greetingTa = initialHour < 12 ? "காலை வணக்கம்" : initialHour < 18 ? "மதிய வணக்கம்" : "மாலை வணக்கம்";
  const greeting = language === "ta" ? greetingTa : greetingEn;

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

  return (
    <div className="today-container">
      {/* Calm Greeting */}
      <header className="today-header">
        <h1 className="today-greeting">{greeting}</h1>
        <p className="today-subtitle">
          {language === "ta"
            ? "உங்கள் மருந்துகள் மற்றும் அன்றாட பராமரிப்பு திட்டம் இங்கே உள்ளது."
            : "Here is your medication schedule and care plan for today."}
        </p>
      </header>

      {/* Your Day Ribbon */}
      <section className="day-ribbon-card">
        <div className="ribbon-header">
          <Clock size={20} color="var(--primary)" weight="bold" />
          <h2 className="ribbon-title">
            {language === "ta" ? "இன்றைய அட்டவணை" : "Your day schedule"}
          </h2>
        </div>

        <div className="ribbon-grid">
          {/* Morning Slot */}
          <div className="time-slot-column">
            <div className="slot-badge morning">
              <Sun size={18} weight="bold" />
              <span>{language === "ta" ? "காலை" : "Morning"}</span>
            </div>
            <div className="slot-pills">
              {morningMeds.length > 0 ? (
                morningMeds.map((med: Medicine, idx: number) => (
                  <div key={idx} className="pill-chip">
                    <Pill size={15} color="var(--primary)" weight="bold" />
                    <div className="pill-chip-text">
                      <span className="pill-name">{med.name.value || "Medicine"}</span>
                      <span className="pill-meta">
                        {med.strength.value || ""} &bull; {med.timing.value || "After food"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-slot-text">
                  {language === "ta" ? "மருந்துகள் இல்லை" : "No medications"}
                </div>
              )}
            </div>
          </div>

          {/* Afternoon Slot */}
          <div className="time-slot-column">
            <div className="slot-badge afternoon">
              <CloudSun size={18} weight="bold" />
              <span>{language === "ta" ? "மதியம்" : "Afternoon"}</span>
            </div>
            <div className="slot-pills">
              {afternoonMeds.length > 0 ? (
                afternoonMeds.map((med: Medicine, idx: number) => (
                  <div key={idx} className="pill-chip">
                    <Pill size={15} color="var(--primary)" weight="bold" />
                    <div className="pill-chip-text">
                      <span className="pill-name">{med.name.value || "Medicine"}</span>
                      <span className="pill-meta">
                        {med.strength.value || ""} &bull; {med.timing.value || "After food"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-slot-text">
                  {language === "ta" ? "மருந்துகள் இல்லை" : "No medications"}
                </div>
              )}
            </div>
          </div>

          {/* Night Slot */}
          <div className="time-slot-column">
            <div className="slot-badge night">
              <Moon size={18} weight="bold" />
              <span>{language === "ta" ? "இரவு" : "Night"}</span>
            </div>
            <div className="slot-pills">
              {nightMeds.length > 0 ? (
                nightMeds.map((med: Medicine, idx: number) => (
                  <div key={idx} className="pill-chip">
                    <Pill size={15} color="var(--primary)" weight="bold" />
                    <div className="pill-chip-text">
                      <span className="pill-name">{med.name.value || "Medicine"}</span>
                      <span className="pill-meta">
                        {med.strength.value || ""} &bull; {med.timing.value || "After food"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-slot-text">
                  {language === "ta" ? "மருந்துகள் இல்லை" : "No medications"}
                </div>
              )}
            </div>
          </div>
        </div>

        {confirmedExtraction && (
          <div className="ribbon-footer-action">
            <button
              type="button"
              className="view-rx-button"
              onClick={onNavigateToCheck}
            >
              <FileText size={16} />
              <span>{language === "ta" ? "மருந்துச் சீட்டை காண்க" : "View active prescription"}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </section>

      {/* Quiet "Add a prescription" Action Card */}
      <section className="add-action-card" onClick={onNavigateToAdd}>
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
        <button type="button" className="add-card-cta">
          {language === "ta" ? "சேர்க்க" : "Add now"}
        </button>
      </section>
    </div>
  );
};
