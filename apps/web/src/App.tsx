import { useState, useEffect } from "react";
import {
  Sun,
  PlusCircle,
  FileText,
  ChatCircleDots,
  Sliders,
  User,
  Flask,
} from "@phosphor-icons/react";
import {
  UploadScreen,
  PrescriptionReview,
  ChatPanel,
  AmdPanel,
} from "./features/ai";
import { TodayScreen } from "./features/today/TodayScreen";
import { PrivacyPage } from "./pages/PrivacyPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import type { ExtractionResult } from "./types/ai";
import { extractionFlaggedFixture } from "./fixtures";
import { isEnvUseFixtures } from "./services/aiApi";
import "./index.css";

export type TabKey = "today" | "add" | "check" | "ask";

export function App() {
  // Navigation & Routing state
  const [currentRoute, setCurrentRoute] = useState<"app" | "privacy" | "404">("app");
  const [activeTab, setActiveTab] = useState<TabKey>("add");
  const [language, setLanguage] = useState<"en" | "ta">("en");
  const [isAmdDrawerOpen, setIsAmdDrawerOpen] = useState(false);
  const [, setHighlightedLineIds] = useState<string[]>([]);

  // Prescription data state
  const [useFixtures, setUseFixtures] = useState<boolean>(isEnvUseFixtures());
  const [currentExtraction, setCurrentExtraction] = useState<ExtractionResult | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>("/rx_demo_001.png");
  const [confirmedExtraction, setConfirmedExtraction] = useState<ExtractionResult | null>(null);

  // Sync route and ?dev=1 on initial load and popstate
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const params = new URLSearchParams(window.location.search);

      // Check ?dev=1
      if (params.get("dev") === "1") {
        setIsAmdDrawerOpen(true);
      }

      if (path === "/privacy" || hash === "#privacy") {
        setCurrentRoute("privacy");
      } else if (
        path === "/" ||
        path === "" ||
        path === "/today" ||
        path === "/add" ||
        path === "/upload" ||
        path === "/check" ||
        path === "/review" ||
        path === "/ask" ||
        path === "/chat" ||
        hash === "#today" ||
        hash === "#add" ||
        hash === "#upload" ||
        hash === "#check" ||
        hash === "#review" ||
        hash === "#ask" ||
        hash === "#chat"
      ) {
        setCurrentRoute("app");
        if (path === "/today" || hash === "#today") setActiveTab("today");
        if (path === "/add" || path === "/upload" || hash === "#add" || hash === "#upload") setActiveTab("add");
        if (path === "/check" || path === "/review" || hash === "#check" || hash === "#review") setActiveTab("check");
        if (path === "/ask" || path === "/chat" || hash === "#ask" || hash === "#chat") setActiveTab("ask");
      } else {
        setCurrentRoute("404");
      }
    };

    handleLocationChange();
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
  }, []);

  // Keyboard shortcut: '.' toggles Under the hood drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === ".") {
        setIsAmdDrawerOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigateTo = (path: string, newTab?: TabKey) => {
    window.history.pushState({}, "", path);
    if (path === "/privacy") {
      setCurrentRoute("privacy");
    } else if (path === "/" || path === "") {
      setCurrentRoute("app");
      if (newTab) setActiveTab(newTab);
    } else {
      setCurrentRoute("404");
    }
  };

  // Called when upload / extraction finishes successfully
  const handleExtractionSuccess = (result: ExtractionResult, imageUrl: string) => {
    setCurrentExtraction(result);
    setCurrentImageUrl(imageUrl);
    setActiveTab("check");
  };

  // Called when patient confirms in PrescriptionReview
  const handleConfirmReminders = () => {
    if (currentExtraction) {
      setConfirmedExtraction(currentExtraction);
    }
    setActiveTab("today");
  };

  // Render standalone Privacy Page
  if (currentRoute === "privacy") {
    return (
      <div className="app-container" lang={language}>
        <PrivacyPage onBack={() => navigateTo("/", "add")} language={language} />
        <footer className="app-footer">
          <p className="footer-notice">
            Synthetic demo data. Not medical advice. Clinicians decide.
          </p>
        </footer>
      </div>
    );
  }

  // Render standalone 404 Page
  if (currentRoute === "404") {
    return (
      <div className="app-container" lang={language}>
        <NotFoundPage onBack={() => navigateTo("/", "add")} language={language} />
        <footer className="app-footer">
          <p className="footer-notice">
            Synthetic demo data. Not medical advice. Clinicians decide.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-container" lang={language}>
      {/* ------------------------------------------------------------------ */}
      {/* Slim Top Strip: Honesty rule per docs/design-v2.md Section 2       */}
      {/* ------------------------------------------------------------------ */}
      {useFixtures && (
        <div className="offline-top-strip" role="status">
          <Flask size={14} weight="bold" />
          <span>Offline sample data, not live AI</span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* App Top Bar per docs/design-v2.md Section 4                        */}
      {/* Wordmark left; EN|தமிழ் switch, Under the hood, avatar right        */}
      {/* Never wraps or scrolls sideways at 360, 768, 1440                   */}
      {/* ------------------------------------------------------------------ */}
      <header className="app-top-bar">
        <div className="top-bar-left">
          <div
            className="brand-link"
            onClick={() => setActiveTab("today")}
            role="button"
            tabIndex={0}
            title="Go to Today"
          >
            <span className="brand-wordmark">CareBridge AI</span>
          </div>
        </div>

        <div className="top-bar-right">
          {/* Segmented language switch: EN | தமிழ் */}
          <div className="lang-segmented-switch" role="radiogroup" aria-label="Language selection">
            <button
              type="button"
              className={`lang-segment-btn ${language === "en" ? "active" : ""}`}
              onClick={() => setLanguage("en")}
              aria-label="Switch to English"
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-segment-btn ${language === "ta" ? "active" : ""}`}
              onClick={() => setLanguage("ta")}
              aria-label="தமிழுக்கு மாறவும்"
            >
              தமிழ்
            </button>
          </div>

          {/* Under the hood icon button (hotkey: .) */}
          <button
            type="button"
            className="under-hood-btn"
            onClick={() => setIsAmdDrawerOpen(true)}
            title="Under the hood (Press .)"
            aria-label="Open Under the hood engineer drawer"
          >
            <Sliders size={18} weight="bold" />
          </button>

          {/* Patient Avatar */}
          <div className="patient-avatar" title="Patient Profile">
            <User size={16} weight="bold" />
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Shell Body: Left Rail on Desktop + Mobile Bottom Tabs              */}
      {/* ------------------------------------------------------------------ */}
      <div className="app-shell-body">
        {/* Desktop Slim Left Rail */}
        <nav className="desktop-left-rail" aria-label="Primary Navigation">
          <button
            type="button"
            className={`rail-nav-btn ${activeTab === "today" ? "active" : ""}`}
            onClick={() => setActiveTab("today")}
          >
            <Sun size={20} weight={activeTab === "today" ? "fill" : "regular"} />
            <span>{language === "ta" ? "இன்று" : "Today"}</span>
          </button>

          <button
            type="button"
            className={`rail-nav-btn ${activeTab === "add" ? "active" : ""}`}
            onClick={() => setActiveTab("add")}
          >
            <PlusCircle size={20} weight={activeTab === "add" ? "fill" : "regular"} />
            <span>{language === "ta" ? "சேர்க்க" : "Add"}</span>
          </button>

          <button
            type="button"
            className={`rail-nav-btn ${activeTab === "check" ? "active" : ""}`}
            onClick={() => {
              if (!currentExtraction) {
                setCurrentExtraction(extractionFlaggedFixture);
                setCurrentImageUrl("/rx_demo_001.png");
              }
              setActiveTab("check");
            }}
          >
            <FileText size={20} weight={activeTab === "check" ? "fill" : "regular"} />
            <span>{language === "ta" ? "சரிபார்" : "Check"}</span>
          </button>

          <button
            type="button"
            className={`rail-nav-btn ${activeTab === "ask" ? "active" : ""}`}
            onClick={() => setActiveTab("ask")}
          >
            <ChatCircleDots size={20} weight={activeTab === "ask" ? "fill" : "regular"} />
            <span>{language === "ta" ? "கேள்" : "Ask"}</span>
          </button>
        </nav>

        {/* Feature Viewport Container */}
        <main className="feature-viewport">
          {activeTab === "today" && (
            <TodayScreen
              language={language}
              confirmedExtraction={confirmedExtraction}
              onNavigateToAdd={() => setActiveTab("add")}
              onNavigateToCheck={() => {
                if (!currentExtraction) {
                  setCurrentExtraction(extractionFlaggedFixture);
                  setCurrentImageUrl("/rx_demo_001.png");
                }
                setActiveTab("check");
              }}
            />
          )}

          {activeTab === "add" && (
            <UploadScreen
              onExtractionSuccess={handleExtractionSuccess}
              useFixtures={useFixtures}
              onToggleFixtures={(val) => setUseFixtures(val)}
              language={language}
            />
          )}

          {activeTab === "check" && (
            <PrescriptionReview
              extraction={currentExtraction || extractionFlaggedFixture}
              imageUrl={currentImageUrl}
              useFixtures={useFixtures}
              onHoverLine={(lineIds) => setHighlightedLineIds(lineIds)}
              onConfirmReminders={handleConfirmReminders}
              onReUpload={() => setActiveTab("add")}
            />
          )}

          {activeTab === "ask" && (
            <div style={{ maxWidth: "860px", margin: "0 auto", width: "100%" }}>
              <ChatPanel
                language={language}
                onLanguageChange={(lang) => setLanguage(lang)}
                confirmedExtraction={confirmedExtraction || currentExtraction}
                useFixtures={useFixtures}
                onCitationClick={(lineIds) => {
                  setHighlightedLineIds(lineIds);
                }}
              />
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="mobile-bottom-tabs" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === "today" ? "active" : ""}`}
          onClick={() => setActiveTab("today")}
        >
          <Sun size={20} weight={activeTab === "today" ? "fill" : "regular"} />
          <span>{language === "ta" ? "இன்று" : "Today"}</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === "add" ? "active" : ""}`}
          onClick={() => setActiveTab("add")}
        >
          <PlusCircle size={20} weight={activeTab === "add" ? "fill" : "regular"} />
          <span>{language === "ta" ? "சேர்க்க" : "Add"}</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === "check" ? "active" : ""}`}
          onClick={() => {
            if (!currentExtraction) {
              setCurrentExtraction(extractionFlaggedFixture);
              setCurrentImageUrl("/rx_demo_001.png");
            }
            setActiveTab("check");
          }}
        >
          <FileText size={20} weight={activeTab === "check" ? "fill" : "regular"} />
          <span>{language === "ta" ? "சரிபார்" : "Check"}</span>
        </button>

        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === "ask" ? "active" : ""}`}
          onClick={() => setActiveTab("ask")}
        >
          <ChatCircleDots size={20} weight={activeTab === "ask" ? "fill" : "regular"} />
          <span>{language === "ta" ? "கேள்" : "Ask"}</span>
        </button>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Under the hood Drawer (Engineer Layer)                             */}
      {/* ------------------------------------------------------------------ */}
      <AmdPanel
        isOpen={isAmdDrawerOpen}
        onClose={() => setIsAmdDrawerOpen(false)}
        useFixtures={useFixtures}
        onToggleFixtures={(val) => setUseFixtures(val)}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Universal Footer (Patient Layer per docs/design-v2.md Section 7)    */}
      {/* ------------------------------------------------------------------ */}
      <footer className="app-footer">
        <p className="footer-notice">
          Synthetic demo data. Not medical advice. Clinicians decide.
        </p>
        <div className="footer-links">
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/privacy");
            }}
          >
            Privacy Policy
          </a>
          <span className="footer-separator">&bull;</span>
          <a
            href="#terms"
            onClick={(e) => {
              e.preventDefault();
              alert("CareBridge AI Terms of Use: Patient decision support only. Clinicians make all final decisions.");
            }}
          >
            Terms of Use
          </a>
          <span className="footer-separator">&bull;</span>
          <a href="mailto:support@carebridge.health">
            Contact Support
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
