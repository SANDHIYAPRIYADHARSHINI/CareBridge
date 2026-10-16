import { useState, useEffect } from "react";
import {
  UploadSimple,
  FileText,
  ChatCircleDots,
  Cpu,
  Translate,
  Flask,
} from "@phosphor-icons/react";
import {
  UploadScreen,
  PrescriptionReview,
  ChatPanel,
  AmdPanel,
} from "./features/ai";
import { PrivacyPage } from "./pages/PrivacyPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import type { ExtractionResult } from "./types/ai";
import { extractionFlaggedFixture } from "./fixtures";
import { isEnvUseFixtures } from "./services/aiApi";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import "./index.css";

export function App() {
  // Navigation & Routing state
  const [currentRoute, setCurrentRoute] = useState<"app" | "privacy" | "404">("app");
  const [activeTab, setActiveTab] = useState<"upload" | "review" | "chat">("upload");
  const [language, setLanguage] = useState<"en" | "ta">("en");
  const [isAmdDrawerOpen, setIsAmdDrawerOpen] = useState(false);
  const [forceEmptyAmd, setForceEmptyAmd] = useState(false);
  const [, setHighlightedLineIds] = useState<string[]>([]);

  // Prescription data state
  const [useFixtures, setUseFixtures] = useState<boolean>(isEnvUseFixtures());
  const [currentExtraction, setCurrentExtraction] = useState<ExtractionResult | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>("/rx_demo_001.png");
  const [confirmedExtraction, setConfirmedExtraction] = useState<ExtractionResult | null>(null);

  // Sync route on initial load and popstate
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      if (path === "/privacy" || hash === "#privacy") {
        setCurrentRoute("privacy");
      } else if (
        path === "/" ||
        path === "" ||
        path === "/upload" ||
        path === "/review" ||
        path === "/chat" ||
        hash === "#upload" ||
        hash === "#review" ||
        hash === "#chat"
      ) {
        setCurrentRoute("app");
        if (path === "/review" || hash === "#review") setActiveTab("review");
        if (path === "/chat" || hash === "#chat") setActiveTab("chat");
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

  const navigateTo = (path: string, newTab?: "upload" | "review" | "chat") => {
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
    setActiveTab("review");
  };

  // Called when patient confirms in PrescriptionReview
  const handleConfirmReminders = () => {
    if (currentExtraction) {
      setConfirmedExtraction(currentExtraction);
    }
    setActiveTab("chat");
  };

  // Render standalone Privacy Page
  if (currentRoute === "privacy") {
    return (
      <div className="app-container" lang={language}>
        <PrivacyPage onBack={() => navigateTo("/", "upload")} language={language} />
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
        <NotFoundPage onBack={() => navigateTo("/", "upload")} language={language} />
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
      {/* App Header per docs/design.md                                      */}
      {/* ------------------------------------------------------------------ */}
      <header className="app-header">
        <div
          className="brand-wrapper"
          onClick={() => setActiveTab("upload")}
          style={{ cursor: "pointer" }}
        >
          <h1 className="brand-title">CareBridge AI</h1>
          <span className="brand-badge">AMD ROCm Track 2</span>
          {useFixtures && (
            <span
              className="persistent-fixtures-badge header-fixtures-badge"
              role="status"
              title="Application is currently operating in offline fixtures demo mode"
            >
              <Flask size={14} weight="bold" />
              <span>Offline sample data, not live AI</span>
            </span>
          )}
        </div>

        {/* 21st.dev / shadcn-style Navigation tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            const nextTab = val as "upload" | "review" | "chat";
            if (nextTab === "review" && !currentExtraction) {
              setCurrentExtraction(extractionFlaggedFixture);
              setCurrentImageUrl("/rx_demo_001.png");
            }
            setActiveTab(nextTab);
          }}
        >
          <TabsList aria-label="Main Navigation">
            <TabsTrigger value="upload">
              <UploadSimple size={18} weight="bold" />
              <span>Upload Rx</span>
            </TabsTrigger>

            <TabsTrigger value="review">
              <FileText size={18} weight="bold" />
              <span>Review</span>
            </TabsTrigger>

            <TabsTrigger value="chat">
              <ChatCircleDots size={18} weight="bold" />
              <span>Ask Companion</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Header Actions */}
        <div className="header-actions">
          {/* Live vs Fixture Toggle */}
          <button
            type="button"
            className="lang-toggle-btn"
            onClick={() => setUseFixtures((prev) => !prev)}
            title="Toggle between Live AI backend (Port 8100) and Offline Synthetic Fixtures"
          >
            <Flask size={16} />
            <span>{useFixtures ? "Offline Fixtures" : "Live AI"}</span>
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
        {activeTab === "upload" && (
          <UploadScreen
            onExtractionSuccess={handleExtractionSuccess}
            useFixtures={useFixtures}
            onToggleFixtures={(val) => setUseFixtures(val)}
            language={language}
          />
        )}

        {activeTab === "review" && (
          <PrescriptionReview
            extraction={currentExtraction || extractionFlaggedFixture}
            imageUrl={currentImageUrl}
            useFixtures={useFixtures}
            onHoverLine={(lineIds) => setHighlightedLineIds(lineIds)}
            onConfirmReminders={handleConfirmReminders}
            onReUpload={() => setActiveTab("upload")}
          />
        )}

        {activeTab === "chat" && (
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <ChatPanel
              language={language}
              onLanguageChange={(lang) => setLanguage(lang)}
              confirmedExtraction={confirmedExtraction || currentExtraction}
              useFixtures={useFixtures}
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
      {/* Universal Footer per docs/design.md                                */}
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
          <a
            href="#terms"
            onClick={(e) => {
              e.preventDefault();
              alert("CareBridge AI Terms of Use: Patient decision support only. Clinicians make all final decisions.");
            }}
          >
            Terms of Use
          </a>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              color: "var(--ink-soft)",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: "inherit",
            }}
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
