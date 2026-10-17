import { useState, useEffect } from "react";
import {
  House,
  Sun,
  PlusCircle,
  FileText,
  ChatCircleDots,
  Pill,
  ClockCounterClockwise,
  Hospital as HospitalIcon,
  CalendarCheck,
  UsersThree,
  Sliders,
  User,
  Flask,
  DotsThreeOutline,
  X,
  SignIn,
  SignOut,
  WarningCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import {
  UploadScreen,
  PrescriptionReview,
  ChatPanel,
  AmdPanel,
} from "./features/ai";
import { TodayScreen } from "./features/today/TodayScreen";
import { PatientDashboard } from "./features/dashboard";
import { RemindersScreen } from "./features/reminders";
import { TimelineScreen } from "./features/timeline";
import { HospitalsScreen } from "./features/hospitals";
import { AppointmentsScreen } from "./features/appointments";
import { CaregiverDashboard } from "./features/caregiver";
import { ProfileScreen } from "./features/profile";
import { AuthProvider, useAuth } from "./features/auth";
import { LoginPage, PrivacyPage, NotFoundPage } from "./pages";
import type { ExtractionResult } from "./types/ai";
import type { Hospital } from "./types/backend";
import { rxDemo001Fixture } from "./fixtures";
import { isEnvUseFixtures } from "./services/aiApi";
import { importRemindersFromPrescription } from "./services/api";
import { LanguageSelector } from "./components/LanguageSelector";
import { isLanguageAiSupported } from "./types/language";
import "./index.css";

export type TabKey =
  | "dashboard"
  | "today"
  | "add"
  | "check"
  | "ask"
  | "reminders"
  | "timeline"
  | "hospitals"
  | "appointments"
  | "profile"
  | "caregiver";

function AppContent() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  // Navigation & Routing state
  const [currentRoute, setCurrentRoute] = useState<"login" | "app" | "privacy" | "404">("login");
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [language, setLanguage] = useState<string>(() => {
    try {
      return (
        sessionStorage.getItem("carebridge_language") ||
        localStorage.getItem("carebridge_language") ||
        "en"
      );
    } catch {
      return "en";
    }
  });

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    try {
      sessionStorage.setItem("carebridge_language", newLang);
      localStorage.setItem("carebridge_language", newLang);
    } catch {
      // ignore storage errors
    }
  };

  const userRole: "patient" | "caregiver" = user?.role === "caregiver" ? "caregiver" : "patient";
  const [accessDeniedNotice, setAccessDeniedNotice] = useState<string | null>(null);
  const [isAmdDrawerOpen, setIsAmdDrawerOpen] = useState(false);
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [, setHighlightedLineIds] = useState<string[]>([]);
  const [preselectedHospitalName, setPreselectedHospitalName] = useState<string | undefined>(undefined);

  // Prescription data state
  const [useFixtures, setUseFixtures] = useState<boolean>(isEnvUseFixtures());
  const [currentExtraction, setCurrentExtraction] = useState<ExtractionResult | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string>("/rx_demo_001.png");
  const [confirmedExtraction, setConfirmedExtraction] = useState<ExtractionResult | null>(null);

  // Sync route and ?dev=1 on initial load and popstate with route guards
  useEffect(() => {
    if (isLoading) return; // Wait until initial token check completes

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
        return;
      }

      if (path === "/login" || hash === "#login") {
        if (isAuthenticated && user) {
          const defaultTab = user.role === "caregiver" ? "caregiver" : "dashboard";
          window.history.replaceState({}, "", `/${defaultTab}`);
          setCurrentRoute("app");
          setActiveTab(defaultTab);
        } else {
          setCurrentRoute("login");
        }
        return;
      }

      // Guard: Unauthenticated user accessing protected routes
      if (!isAuthenticated) {
        window.history.replaceState({}, "", "/login");
        setCurrentRoute("login");
        return;
      }

      const effectiveRole: "patient" | "caregiver" =
        user?.role === "caregiver" ? "caregiver" : "patient";

      if (
        path === "/" ||
        path === "" ||
        path === "/dashboard" ||
        path === "/today" ||
        path === "/add" ||
        path === "/upload" ||
        path === "/check" ||
        path === "/review" ||
        path === "/ask" ||
        path === "/chat" ||
        path === "/reminders" ||
        path === "/timeline" ||
        path === "/hospitals" ||
        path === "/appointments" ||
        path === "/profile" ||
        path === "/caregiver" ||
        hash === "#dashboard" ||
        hash === "#today" ||
        hash === "#add" ||
        hash === "#upload" ||
        hash === "#check" ||
        hash === "#review" ||
        hash === "#ask" ||
        hash === "#chat" ||
        hash === "#reminders" ||
        hash === "#timeline" ||
        hash === "#hospitals" ||
        hash === "#appointments" ||
        hash === "#profile" ||
        hash === "#caregiver"
      ) {
        setCurrentRoute("app");

        // Protected Guard: Patient trying to access caregiver-only portal
        if (path === "/caregiver" || hash === "#caregiver") {
          if (effectiveRole !== "caregiver") {
            setAccessDeniedNotice(
              "Access Denied: The Caregiver Portal is restricted to authorized family caregivers."
            );
            setActiveTab("dashboard");
            window.history.replaceState({}, "", "/dashboard");
            return;
          }
          setActiveTab("caregiver");
          return;
        }

        // Protected Guard: Caregiver trying to access patient self-care upload
        if (
          effectiveRole === "caregiver" &&
          (path === "/add" || path === "/check" || path === "/upload" || path === "/review")
        ) {
          setActiveTab("caregiver");
          window.history.replaceState({}, "", "/caregiver");
          return;
        }

        if (path === "/" || path === "" || path === "/dashboard" || hash === "#dashboard") {
          setActiveTab(effectiveRole === "caregiver" ? "caregiver" : "dashboard");
        } else if (path === "/today" || hash === "#today") setActiveTab("today");
        else if (path === "/add" || path === "/upload" || hash === "#add" || hash === "#upload")
          setActiveTab("add");
        else if (path === "/check" || path === "/review" || hash === "#check" || hash === "#review")
          setActiveTab("check");
        else if (path === "/ask" || path === "/chat" || hash === "#ask" || hash === "#chat")
          setActiveTab("ask");
        else if (path === "/reminders" || hash === "#reminders") setActiveTab("reminders");
        else if (path === "/timeline" || hash === "#timeline") setActiveTab("timeline");
        else if (path === "/hospitals" || hash === "#hospitals") setActiveTab("hospitals");
        else if (path === "/appointments" || hash === "#appointments") setActiveTab("appointments");
        else if (path === "/profile" || hash === "#profile") setActiveTab("profile");
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
  }, [isAuthenticated, isLoading, user]);

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
    const cleanPath = path.toLowerCase();
    if (cleanPath === "/privacy") {
      setCurrentRoute("privacy");
    } else if (cleanPath === "/login") {
      setCurrentRoute("login");
    } else if (
      cleanPath === "/" ||
      cleanPath === "" ||
      cleanPath === "/dashboard" ||
      cleanPath === "/today" ||
      cleanPath === "/add" ||
      cleanPath === "/upload" ||
      cleanPath === "/check" ||
      cleanPath === "/review" ||
      cleanPath === "/ask" ||
      cleanPath === "/chat" ||
      cleanPath === "/reminders" ||
      cleanPath === "/timeline" ||
      cleanPath === "/hospitals" ||
      cleanPath === "/appointments" ||
      cleanPath === "/profile" ||
      cleanPath === "/caregiver"
    ) {
      if (!isAuthenticated) {
        window.history.replaceState({}, "", "/login");
        setCurrentRoute("login");
      } else {
        setCurrentRoute("app");
        if (newTab) setActiveTab(newTab);
      }
    } else {
      setCurrentRoute("404");
    }
  };

  const handleLogout = () => {
    logout();
    setAccessDeniedNotice(null);
    window.history.pushState({}, "", "/login");
    setCurrentRoute("login");
  };

  // Called when upload / extraction finishes successfully
  const handleExtractionSuccess = (result: ExtractionResult, imageUrl: string) => {
    setCurrentExtraction(result);
    setCurrentImageUrl(imageUrl);
    setActiveTab("check");
  };

  // Called when patient confirms in PrescriptionReview
  const handleConfirmReminders = async () => {
    if (currentExtraction) {
      setConfirmedExtraction(currentExtraction);
      if (currentExtraction.medicines && currentExtraction.medicines.length > 0) {
        try {
          const payload = {
            prescription_id: currentExtraction.document_id || `rx-${Date.now()}`,
            medicines: currentExtraction.medicines.map((m) => {
              const name = m.name?.value || "Prescribed Medicine";
              const strength = m.strength?.value || "";
              const timing = m.timing?.value || "";
              const frequency = m.frequency?.value || "";
              const instructions = [timing, m.instructions?.value].filter(Boolean).join(" - ");

              // Determine slots
              const slots: ("morning" | "noon" | "evening" | "night")[] = [];
              const lowerFreq = `${frequency} ${timing}`.toLowerCase();
              if (
                lowerFreq.includes("morning") ||
                frequency.startsWith("1-") ||
                frequency === "1-0-1" ||
                frequency === "1-1-1" ||
                frequency === "1-0-0"
              ) {
                slots.push("morning");
              }
              if (
                lowerFreq.includes("afternoon") ||
                lowerFreq.includes("noon") ||
                frequency.includes("-1-") ||
                frequency === "1-1-1"
              ) {
                slots.push("noon");
              }
              if (
                lowerFreq.includes("evening") ||
                lowerFreq.includes("night") ||
                frequency.endsWith("-1") ||
                frequency === "1-0-1" ||
                frequency === "1-1-1" ||
                frequency === "0-0-1"
              ) {
                slots.push("night");
              }
              if (slots.length === 0) {
                slots.push("morning");
              }

              return {
                medicine_name: name,
                dosage: strength || "As prescribed",
                instructions: instructions || "Take as directed by clinician",
                times_per_day: slots.length,
                slots,
                total_supply: 30,
                remaining_supply: 30,
                refill_threshold: 7,
              };
            }),
          };
          await importRemindersFromPrescription(payload);
        } catch (err) {
          console.warn("Could not sync verified prescription reminders to backend:", err);
        }
      }
    }
    setActiveTab("reminders");
  };

  const handleSelectHospitalForBooking = (hospital: Hospital) => {
    setPreselectedHospitalName(hospital.name);
    setActiveTab("appointments");
  };

  // Loading Session Restoration View
  if (isLoading) {
    return (
      <div
        className="app-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "var(--canvas)",
        }}
      >
        <div style={{ textAlign: "center", color: "var(--primary)" }}>
          <CircleNotch size={38} className="skeleton-spinner" weight="bold" />
          <p
            style={{
              marginTop: "1rem",
              fontSize: "0.95rem",
              color: "var(--ink-soft)",
              fontWeight: 600,
            }}
          >
            Verifying CareBridge Session...
          </p>
        </div>
      </div>
    );
  }

  // Render dedicated Login / Registration Page (Requirement 1 & 2)
  if (currentRoute === "login") {
    return (
      <LoginPage
        language={language}
        onLanguageChange={handleLanguageChange}
        onLoginSuccess={(authedUser) => {
          const targetTab = authedUser.role === "caregiver" ? "caregiver" : "dashboard";
          window.history.pushState({}, "", `/${targetTab}`);
          setCurrentRoute("app");
          setActiveTab(targetTab);
        }}
        onNavigateToPrivacy={() => navigateTo("/privacy")}
        defaultRole="patient"
        accessDeniedMessage={accessDeniedNotice}
      />
    );
  }

  // Render standalone Privacy Page
  if (currentRoute === "privacy") {
    return (
      <div className="app-container" lang={language}>
        <PrivacyPage
          onBack={() => {
            if (isAuthenticated) {
              navigateTo(userRole === "caregiver" ? "/caregiver" : "/dashboard");
            } else {
              navigateTo("/login");
            }
          }}
          language={language}
        />
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
        <NotFoundPage
          onBack={() => {
            if (isAuthenticated) {
              navigateTo(userRole === "caregiver" ? "/caregiver" : "/dashboard");
            } else {
              navigateTo("/login");
            }
          }}
          language={language}
        />
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
      {/* Slim Top Strip */}
      {useFixtures && (
        <div className="offline-top-strip" role="status">
          <Flask size={14} weight="bold" />
          <span>Offline sample data &bull; Synthetic Demo Mode</span>
        </div>
      )}

      {/* App Top Bar */}
      <header className="app-top-bar">
        <div className="top-bar-left">
          <div
            className="brand-link"
            onClick={() => setActiveTab(userRole === "caregiver" ? "caregiver" : "dashboard")}
            role="button"
            tabIndex={0}
            title="Go to Dashboard"
          >
            <span className="brand-wordmark">CareBridge AI</span>
          </div>
        </div>

        <div className="top-bar-right">
          {/* Accessible Language Selector Button & Dropdown */}
          <LanguageSelector
            language={language}
            onSelectLanguage={handleLanguageChange}
          />

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

          {/* User Auth Status / Sign Out Button */}
          {isAuthenticated && user ? (
            <div
              className="auth-user-pill"
              onClick={() => setActiveTab("profile")}
              title="Signed In • View Profile & Settings"
              role="button"
              tabIndex={0}
            >
              <span>{user.full_name.split(" ")[0]}</span>
              <span className={`auth-user-role-tag ${user.role}`}>
                {user.role}
              </span>
              <button
                type="button"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px",
                  color: "#64748b",
                  display: "flex",
                  alignItems: "center",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
                title="Sign Out"
                aria-label="Sign Out"
              >
                <SignOut size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="auth-signin-btn"
              onClick={() => navigateTo("/login")}
              title="Sign In or Register"
            >
              <SignIn size={14} weight="bold" />
              <span>{language === "ta" ? "உள்நுழை" : "Sign In"}</span>
            </button>
          )}

          {/* Profile Avatar */}
          <div
            className="patient-avatar"
            title="Open Profile & Settings"
            onClick={() => setActiveTab("profile")}
            role="button"
            tabIndex={0}
            style={{ cursor: "pointer" }}
          >
            <User size={16} weight="bold" />
          </div>
        </div>
      </header>

      {/* Access Denied Route Guard Notification */}
      {accessDeniedNotice && (
        <div
          className="access-denied-banner"
          role="alert"
          style={{
            backgroundColor: "var(--danger-bg)",
            borderBottom: "1px solid rgba(179, 38, 30, 0.3)",
            color: "var(--danger)",
            padding: "0.6rem 1.25rem",
            fontSize: "0.86rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <WarningCircle size={18} weight="fill" />
            <span>{accessDeniedNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setAccessDeniedNotice(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Unsupported AI language notification banner */}
      {!isLanguageAiSupported(language) && (
        <div className="lang-unsupported-banner" role="alert">
          <div className="banner-content">
            <WarningCircle size={16} weight="bold" />
            <span>This language is not currently supported by the AI service.</span>
          </div>
          <button
            type="button"
            className="banner-switch-btn"
            onClick={() => handleLanguageChange("en")}
            title="Switch back to English"
          >
            Switch to English
          </button>
        </div>
      )}

      {/* Shell Body: Left Rail on Desktop + Mobile Bottom Tabs */}
      <div className="app-shell-body">
        {/* Desktop Slim Left Rail */}
        <nav className="desktop-left-rail" aria-label="Primary Navigation">
          {userRole === "patient" ? (
            <>
              {/* Patient Core Navigation */}
              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
                onClick={() => setActiveTab("dashboard")}
              >
                <House size={20} weight={activeTab === "dashboard" ? "fill" : "regular"} />
                <span>{language === "ta" ? "முகப்பு" : "Home"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "add" ? "active" : ""}`}
                onClick={() => setActiveTab("add")}
              >
                <PlusCircle size={20} weight={activeTab === "add" ? "fill" : "regular"} />
                <span>{language === "ta" ? "சேர்க்க" : "Add Rx"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "check" ? "active" : ""}`}
                onClick={() => {
                  if (!currentExtraction) {
                    setCurrentExtraction(rxDemo001Fixture);
                    setCurrentImageUrl("/rx_demo_001.png");
                  }
                  setActiveTab("check");
                }}
              >
                <FileText size={20} weight={activeTab === "check" ? "fill" : "regular"} />
                <span>{language === "ta" ? "சரிபார்" : "Check Rx"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "ask" ? "active" : ""}`}
                onClick={() => setActiveTab("ask")}
              >
                <ChatCircleDots size={20} weight={activeTab === "ask" ? "fill" : "regular"} />
                <span>{language === "ta" ? "கேள்" : "Ask AI"}</span>
              </button>

              <div className="rail-nav-divider" />

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "reminders" ? "active" : ""}`}
                onClick={() => setActiveTab("reminders")}
              >
                <Pill size={20} weight={activeTab === "reminders" ? "fill" : "regular"} />
                <span>{language === "ta" ? "மருந்துகள்" : "Meds"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "timeline" ? "active" : ""}`}
                onClick={() => setActiveTab("timeline")}
              >
                <ClockCounterClockwise size={20} weight={activeTab === "timeline" ? "fill" : "regular"} />
                <span>{language === "ta" ? "வரலாறு" : "Timeline"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "hospitals" ? "active" : ""}`}
                onClick={() => setActiveTab("hospitals")}
              >
                <HospitalIcon size={20} weight={activeTab === "hospitals" ? "fill" : "regular"} />
                <span>{language === "ta" ? "மருத்துவமனை" : "Hospitals"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "appointments" ? "active" : ""}`}
                onClick={() => setActiveTab("appointments")}
              >
                <CalendarCheck size={20} weight={activeTab === "appointments" ? "fill" : "regular"} />
                <span>{language === "ta" ? "சந்திப்பு" : "Book"}</span>
              </button>
            </>
          ) : (
            <>
              {/* Caregiver Core Navigation */}
              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "caregiver" ? "active" : ""}`}
                onClick={() => setActiveTab("caregiver")}
              >
                <UsersThree size={20} weight={activeTab === "caregiver" ? "fill" : "regular"} />
                <span>{language === "ta" ? "குடும்பம்" : "Caregiver"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "timeline" ? "active" : ""}`}
                onClick={() => setActiveTab("timeline")}
              >
                <ClockCounterClockwise size={20} weight={activeTab === "timeline" ? "fill" : "regular"} />
                <span>{language === "ta" ? "வரலாறு" : "Timeline"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "reminders" ? "active" : ""}`}
                onClick={() => setActiveTab("reminders")}
              >
                <Pill size={20} weight={activeTab === "reminders" ? "fill" : "regular"} />
                <span>{language === "ta" ? "மருந்துகள்" : "Meds"}</span>
              </button>

              <button
                type="button"
                className={`rail-nav-btn ${activeTab === "profile" ? "active" : ""}`}
                onClick={() => setActiveTab("profile")}
              >
                <User size={20} weight={activeTab === "profile" ? "fill" : "regular"} />
                <span>{language === "ta" ? "சுயவிவரம்" : "Profile"}</span>
              </button>
            </>
          )}
        </nav>

        {/* Feature Viewport Container */}
        <main className="feature-viewport">
          {activeTab === "dashboard" && (
            <PatientDashboard
              language={language}
              onNavigateToTab={(tab) => setActiveTab(tab as TabKey)}
              onScanPrescription={() => setActiveTab("add")}
            />
          )}

          {activeTab === "caregiver" && (
            <CaregiverDashboard language={language} />
          )}

          {activeTab === "today" && (
            <TodayScreen
              language={language}
              confirmedExtraction={confirmedExtraction}
              onNavigateToAdd={() => setActiveTab("add")}
              onNavigateToCheck={() => {
                if (!currentExtraction) {
                  setCurrentExtraction(rxDemo001Fixture);
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
              extraction={currentExtraction || rxDemo001Fixture}
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
                onLanguageChange={(lang) => handleLanguageChange(lang)}
                confirmedExtraction={confirmedExtraction || currentExtraction}
                useFixtures={useFixtures}
                onCitationClick={(lineIds) => {
                  setHighlightedLineIds(lineIds);
                }}
              />
            </div>
          )}

          {activeTab === "reminders" && (
            <RemindersScreen
              language={language}
              onAddFromPrescription={() => setActiveTab("add")}
            />
          )}

          {activeTab === "timeline" && (
            <TimelineScreen language={language} />
          )}

          {activeTab === "hospitals" && (
            <HospitalsScreen
              language={language}
              onSelectHospitalForBooking={handleSelectHospitalForBooking}
            />
          )}

          {activeTab === "appointments" && (
            <AppointmentsScreen
              language={language}
              preselectedHospitalName={preselectedHospitalName}
            />
          )}

          {activeTab === "profile" && (
            <ProfileScreen
              language={language}
              onLanguageChange={(lang) => handleLanguageChange(lang)}
              userRole={userRole}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="mobile-bottom-tabs" aria-label="Mobile Navigation">
        {userRole === "patient" ? (
          <>
            <button
              type="button"
              className={`mobile-tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <House size={20} weight={activeTab === "dashboard" ? "fill" : "regular"} />
              <span>{language === "ta" ? "முகப்பு" : "Home"}</span>
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
                  setCurrentExtraction(rxDemo001Fixture);
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

            <button
              type="button"
              className="mobile-tab-btn"
              onClick={() => setIsMobileMoreOpen(true)}
              aria-label="More navigation items"
            >
              <DotsThreeOutline size={20} weight="fill" />
              <span>{language === "ta" ? "மேலும்" : "More"}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`mobile-tab-btn ${activeTab === "caregiver" ? "active" : ""}`}
              onClick={() => setActiveTab("caregiver")}
            >
              <UsersThree size={20} weight={activeTab === "caregiver" ? "fill" : "regular"} />
              <span>{language === "ta" ? "குடும்பம்" : "Caregiver"}</span>
            </button>

            <button
              type="button"
              className={`mobile-tab-btn ${activeTab === "timeline" ? "active" : ""}`}
              onClick={() => setActiveTab("timeline")}
            >
              <ClockCounterClockwise size={20} weight={activeTab === "timeline" ? "fill" : "regular"} />
              <span>{language === "ta" ? "வரலாறு" : "Timeline"}</span>
            </button>

            <button
              type="button"
              className={`mobile-tab-btn ${activeTab === "reminders" ? "active" : ""}`}
              onClick={() => setActiveTab("reminders")}
            >
              <Pill size={20} weight={activeTab === "reminders" ? "fill" : "regular"} />
              <span>{language === "ta" ? "மருந்துகள்" : "Meds"}</span>
            </button>

            <button
              type="button"
              className={`mobile-tab-btn ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <User size={20} weight={activeTab === "profile" ? "fill" : "regular"} />
              <span>{language === "ta" ? "சுயவிவரம்" : "Profile"}</span>
            </button>
          </>
        )}
      </nav>

      {/* Mobile More Drawer */}
      {isMobileMoreOpen && (
        <div className="mobile-more-backdrop" onClick={() => setIsMobileMoreOpen(false)}>
          <div className="mobile-more-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-more-header">
              <span className="mobile-more-title">{language === "ta" ? "அனைத்து சேவைகள்" : "All CareBridge Services"}</span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsMobileMoreOpen(false)}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mobile-more-grid">
              <button
                type="button"
                className={`more-drawer-btn ${activeTab === "reminders" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("reminders");
                  setIsMobileMoreOpen(false);
                }}
              >
                <Pill size={24} weight="bold" />
                <span>{language === "ta" ? "மருந்து நினைவூட்டல்கள்" : "Medication Reminders"}</span>
              </button>

              <button
                type="button"
                className={`more-drawer-btn ${activeTab === "timeline" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("timeline");
                  setIsMobileMoreOpen(false);
                }}
              >
                <ClockCounterClockwise size={24} weight="bold" />
                <span>{language === "ta" ? "மருத்துவ காலக்கோடு" : "Health Timeline"}</span>
              </button>

              <button
                type="button"
                className={`more-drawer-btn ${activeTab === "hospitals" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("hospitals");
                  setIsMobileMoreOpen(false);
                }}
              >
                <HospitalIcon size={24} weight="bold" />
                <span>{language === "ta" ? "மருத்துவமனை வரைபடம்" : "Hospital Finder"}</span>
              </button>

              <button
                type="button"
                className={`more-drawer-btn ${activeTab === "appointments" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("appointments");
                  setIsMobileMoreOpen(false);
                }}
              >
                <CalendarCheck size={24} weight="bold" />
                <span>{language === "ta" ? "சந்திப்பு முன்பதிவு" : "Book Appointment"}</span>
              </button>

              <button
                type="button"
                className={`more-drawer-btn ${activeTab === "profile" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("profile");
                  setIsMobileMoreOpen(false);
                }}
              >
                <User size={24} weight="bold" />
                <span>{language === "ta" ? "சுயவிவரம் & அனுமதி" : "Profile & Caregivers"}</span>
              </button>

              <button
                type="button"
                className={`more-drawer-btn ${activeTab === "today" ? "active" : ""}`}
                onClick={() => {
                  setActiveTab("today");
                  setIsMobileMoreOpen(false);
                }}
              >
                <Sun size={24} weight="bold" />
                <span>{language === "ta" ? "இன்றைய அட்டவணை" : "Today Schedule"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Under the hood Drawer (Engineer Layer) */}
      <AmdPanel
        isOpen={isAmdDrawerOpen}
        onClose={() => setIsAmdDrawerOpen(false)}
        useFixtures={useFixtures}
        onToggleFixtures={(val) => setUseFixtures(val)}
      />

      {/* Universal Footer */}
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

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
