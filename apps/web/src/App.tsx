import { useState } from "react";
import {
  FileText,
  ChatCircleDots,
  Cpu,
  Translate,
  Flask,
} from "@phosphor-icons/react";
import {
  PrescriptionReview,
  ChatPanel,
  AmdPanel,
} from "./features/ai";
import {
  extractionOkFixture,
  extractionFlaggedFixture,
} from "./fixtures";
import "./index.css";

export function App() {
  const [activeTab, setActiveTab] = useState<"review" | "chat">("review");
  const [language, setLanguage] = useState<"en" | "ta">("en");
  const [isAmdDrawerOpen, setIsAmdDrawerOpen] = useState(false);
  const [useFlaggedData, setUseFlaggedData] = useState(true); // default to flagged to show amber check
  const [forceEmptyAmd, setForceEmptyAmd] = useState(false);
  const [, setHighlightedLineIds] = useState<string[]>([]);

  const currentExtraction = useFlaggedData
    ? extractionFlaggedFixture
    : extractionOkFixture;

  return (
    <div className="app-container" lang={language}>
      {/* ------------------------------------------------------------------ */}
      {/* App Header per docs/design.md                                      */}
      {/* ------------------------------------------------------------------ */}
      <header className="app-header">
        <div className="brand-wrapper">
          <h1 className="brand-title">CareBridge AI</h1>
          <span className="brand-badge">AMD ROCm Track 2</span>
        </div>

        {/* Navigation tabs */}
        <nav className="nav-tab-list" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "review" ? "active" : ""}`}
            onClick={() => setActiveTab("review")}
          >
            <FileText size={18} weight="bold" />
            <span>Prescription Review</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            <ChatCircleDots size={18} weight="bold" />
            <span>Ask Companion</span>
          </button>
        </nav>

        {/* Header Actions */}
        <div className="header-actions">
          {/* Sample Switcher (Flagged vs Verified) */}
          <button
            type="button"
            className="lang-toggle-btn"
            onClick={() => setUseFlaggedData((prev) => !prev)}
            title="Toggle between amber warning and verified prescription state"
          >
            <Flask size={16} />
            <span>{useFlaggedData ? "Showing Amber Flag" : "Showing Verified"}</span>
          </button>

          {/* Language Toggle */}
          <button
            type="button"
            className="lang-toggle-btn"
            onClick={() => setLanguage((prev) => (prev === "en" ? "ta" : "en"))}
            title="Toggle between English and Tamil"
          >
            <Translate size={16} />
            <span>{language === "en" ? "தமிழ்" : "English"}</span>
          </button>

          {/* AMD ROCm Telemetry Panel Button */}
          <button
            type="button"
            className="amd-trigger-btn"
            onClick={() => {
              setForceEmptyAmd(false);
              setIsAmdDrawerOpen(true);
            }}
            title="Inspect AMD ROCm performance and latency benchmarks"
          >
            <Cpu size={16} weight="bold" />
            <span>AMD Benchmarks</span>
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main Feature Viewport                                              */}
      {/* ------------------------------------------------------------------ */}
      <main className="main-content">
        {activeTab === "review" ? (
          <PrescriptionReview
            extraction={currentExtraction}
            imageUrl="/rx_001.png"
            onHoverLine={(lineIds) => setHighlightedLineIds(lineIds)}
            onConfirmReminders={() => alert("Reminders confirmed and synced with care schedule!")}
          />
        ) : (
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <ChatPanel
              language={language}
              onLanguageChange={(lang) => setLanguage(lang)}
              onCitationClick={(lineIds) => {
                setHighlightedLineIds(lineIds);
                alert(`Highlighted OCR evidence line(s): ${lineIds.join(", ")} on source prescription`);
              }}
            />
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* AMD ROCm Benchmark Drawer                                          */}
      {/* ------------------------------------------------------------------ */}
      <AmdPanel
        isOpen={isAmdDrawerOpen}
        onClose={() => setIsAmdDrawerOpen(false)}
        forceEmpty={forceEmptyAmd}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Footer per docs/design.md                                          */}
      {/* ------------------------------------------------------------------ */}
      <footer className="app-footer">
        <p className="footer-notice">
          Synthetic demo data. Not medical advice. Clinicians decide.
        </p>
        <div className="footer-links">
          <a href="#privacy" onClick={(e) => { e.preventDefault(); alert("CareBridge AI adheres to zero-retention stateless processing."); }}>
            Privacy Policy
          </a>
          <a href="#terms" onClick={(e) => { e.preventDefault(); alert("CareBridge AI Terms of Use: Patient decision support only."); }}>
            Terms of Use
          </a>
          <button
            type="button"
            style={{ background: "none", border: "none", color: "var(--ink-soft)", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}
            onClick={() => {
              setForceEmptyAmd((prev) => !prev);
              setIsAmdDrawerOpen(true);
            }}
          >
            Demo: {forceEmptyAmd ? "Switch to Populated Benchmark" : "Test 'No Benchmark Yet' State"}
          </button>
          <a href="mailto:support@carebridge.health">
            Contact Support
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
