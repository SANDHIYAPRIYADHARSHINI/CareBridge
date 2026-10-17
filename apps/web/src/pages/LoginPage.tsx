import React, { useState } from "react";
import {
  User as UserIcon,
  ShieldCheck,
  LockKey,
  EnvelopeSimple,
  Phone,
  SignIn,
  UserPlus,
  Sparkle,
  WarningCircle,
  CheckCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import { useAuth } from "../features/auth";
import type { User, UserRole } from "../types/backend";
import { LanguageSelector } from "../components/LanguageSelector";
import "./LoginPage.css";

interface LoginPageProps {
  language: string;
  onLanguageChange: (lang: string) => void;
  onLoginSuccess: (user: User) => void;
  onNavigateToPrivacy: () => void;
  defaultRole?: UserRole;
  accessDeniedMessage?: string | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  language,
  onLanguageChange,
  onLoginSuccess,
  onNavigateToPrivacy,
  defaultRole = "patient",
  accessDeniedMessage,
}) => {
  const { login, register, loginAsDemo, error, clearError, isLoading } = useAuth();
  const isTa = language === "ta";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [selectedRole, setSelectedRole] = useState<"patient" | "caregiver">(
    defaultRole === "caregiver" ? "caregiver" : "patient"
  );

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // Validation & UI states
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(accessDeniedMessage || null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (!email.trim()) {
      errs.email = isTa ? "மின்னஞ்சல் தேவை" : "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = isTa ? "சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்" : "Enter a valid email address";
    }

    if (!password.trim()) {
      errs.password = isTa ? "கடவுச்சொல் தேவை" : "Password is required";
    } else if (password.length < 6) {
      errs.password = isTa
        ? "கடவுச்சொல் குறைந்தது 6 எழுத்துகள் இருக்க வேண்டும்"
        : "Password must be at least 6 characters";
    }

    if (mode === "register") {
      if (!fullName.trim()) {
        errs.fullName = isTa ? "முழு பெயர் தேவை" : "Full name is required";
      }
    }

    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!validateForm()) return;

    try {
      let authedUser: User;
      if (mode === "login") {
        authedUser = await login(email.trim(), password);
      } else {
        authedUser = await register({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          role: selectedRole,
          phone_number: phoneNumber.trim() || undefined,
        });
      }

      setSuccessMessage(
        isTa
          ? `வரவேற்கிறோம், ${authedUser.full_name}! திறக்கிறது...`
          : `Welcome, ${authedUser.full_name}! Directing to your portal...`
      );

      // Brief delay to give user visual feedback before redirect
      setTimeout(() => {
        onLoginSuccess(authedUser);
      }, 500);
    } catch {
      // Error is captured by AuthContext or caught here
    }
  };

  const handleDemoLogin = async (demoRole: "patient" | "caregiver") => {
    setLocalError(null);
    clearError();
    setValidationErrors({});
    setSelectedRole(demoRole);

    try {
      const authedUser = await loginAsDemo(demoRole);
      setSuccessMessage(
        isTa
          ? `மாதிரி பயனர் உள்நுழைந்தது: ${authedUser.full_name}`
          : `Signed in with synthetic demo profile: ${authedUser.full_name}`
      );
      setTimeout(() => {
        onLoginSuccess(authedUser);
      }, 400);
    } catch {
      // Handled
    }
  };

  const activeError = localError || error;

  return (
    <div className="login-page-container" lang={language}>
      {/* Top Bar with Brand & Language Selector */}
      <header className="login-top-bar">
        <div className="login-brand-group">
          <span className="login-brand-wordmark">CareBridge AI</span>
          <span className="login-brand-tagline">
            {isTa ? "மருத்துவப் பராமரிப்பு தளம்" : "Patient & Caregiver Portal"}
          </span>
        </div>

        <div className="login-top-actions">
          <button
            type="button"
            className="login-privacy-link"
            onClick={onNavigateToPrivacy}
            title="Read Privacy Policy"
          >
            {isTa ? "தனியுரிமை" : "Privacy Policy"}
          </button>
          <LanguageSelector
            language={language}
            onSelectLanguage={onLanguageChange}
          />
        </div>
      </header>

      {/* Main Viewport */}
      <main className="login-main-viewport">
        <div className="login-card">
          {/* Header */}
          <div className="login-card-header">
            <div className="login-badge-row">
              <ShieldCheck size={15} weight="bold" />
              <span>{isTa ? "அங்கீகரிக்கப்பட்ட அணுகல்" : "Verified Clinical Auth"}</span>
            </div>
            <h1 className="login-heading">
              {mode === "login"
                ? isTa
                  ? "CareBridge உள்நுழைவு"
                  : "Sign In to CareBridge"
                : isTa
                ? "புதிய கணக்கு பதிவு"
                : "Create Your Account"}
            </h1>
            <p className="login-subheading">
              {isTa
                ? "உங்கள் கணக்கு வகையைத் தேர்ந்தெடுத்து பாதுகாப்பாக உள்நுழையவும்"
                : "Choose your clinical role and authenticate with zero-knowledge consent governance"}
            </p>
          </div>

          {/* Role Selection (Requirement 3 & 7) */}
          <div className="login-role-selection-box" role="radiogroup" aria-label="Select your role">
            <div className="login-role-legend">
              <ShieldCheck size={14} weight="bold" />
              <span>{isTa ? "1. உங்கள் கணக்கு வகை (Role):" : "1. Choose Your Role:"}</span>
            </div>
            <div className="login-role-options-grid">
              <button
                type="button"
                className={`login-role-card ${selectedRole === "patient" ? "active" : ""}`}
                onClick={() => setSelectedRole("patient")}
                aria-checked={selectedRole === "patient"}
                role="radio"
              >
                <div className="login-role-card-header">
                  <UserIcon size={18} weight={selectedRole === "patient" ? "bold" : "regular"} />
                  <span>{isTa ? "நோயாளி" : "Patient"}</span>
                </div>
                <span className="login-role-card-desc">
                  {isTa
                    ? "சுய சுகாதாரப் பராமரிப்பு & மருந்துகள்"
                    : "Self-care, prescription management & reminders"}
                </span>
              </button>

              <button
                type="button"
                className={`login-role-card ${selectedRole === "caregiver" ? "active" : ""}`}
                onClick={() => setSelectedRole("caregiver")}
                aria-checked={selectedRole === "caregiver"}
                role="radio"
              >
                <div className="login-role-card-header">
                  <ShieldCheck size={18} weight={selectedRole === "caregiver" ? "bold" : "regular"} />
                  <span>{isTa ? "பராமரிப்பாளர்" : "Caregiver"}</span>
                </div>
                <span className="login-role-card-desc">
                  {isTa
                    ? "குடும்ப மேற்பார்வை & அனுமதி அணுகல்"
                    : "Family member or clinical oversight with consent"}
                </span>
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs (Requirement 4) */}
          <div className="login-tabs-container" role="tablist">
            <button
              type="button"
              className={`login-tab-button ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setLocalError(null);
                clearError();
                setValidationErrors({});
              }}
              role="tab"
              aria-selected={mode === "login"}
            >
              <SignIn size={16} weight="bold" />
              <span>{isTa ? "உள்நுழை" : "Sign In"}</span>
            </button>
            <button
              type="button"
              className={`login-tab-button ${mode === "register" ? "active" : ""}`}
              onClick={() => {
                setMode("register");
                setLocalError(null);
                clearError();
                setValidationErrors({});
              }}
              role="tab"
              aria-selected={mode === "register"}
            >
              <UserPlus size={16} weight="bold" />
              <span>{isTa ? "பதிவு செய்" : "Register"}</span>
            </button>
          </div>

          {/* Error Banner */}
          {activeError && (
            <div className="login-error-alert" role="alert">
              <WarningCircle size={18} weight="fill" />
              <span>{activeError}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="login-success-alert" role="status">
              <CheckCircle size={18} weight="fill" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Authentication Form */}
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {mode === "register" && (
              <div className="login-field-group">
                <label htmlFor="login-name-input" className="login-field-label">
                  <span>{isTa ? "முழு பெயர்" : "Full Name"} *</span>
                </label>
                <div className="login-input-container">
                  <UserIcon size={18} className="login-input-icon" />
                  <input
                    id="login-name-input"
                    type="text"
                    className={`login-text-input ${validationErrors.fullName ? "input-error" : ""}`}
                    placeholder={
                      selectedRole === "patient" ? "Kaviya Sundaram" : "Dr. Anitha Nathan"
                    }
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (validationErrors.fullName) {
                        setValidationErrors((prev) => ({ ...prev, fullName: "" }));
                      }
                    }}
                    disabled={isLoading}
                    autoComplete="name"
                    required
                  />
                </div>
                {validationErrors.fullName && (
                  <span className="login-input-validation-msg">{validationErrors.fullName}</span>
                )}
              </div>
            )}

            <div className="login-field-group">
              <label htmlFor="login-email-input" className="login-field-label">
                <span>{isTa ? "மின்னஞ்சல் முகவரி" : "Email Address"} *</span>
              </label>
              <div className="login-input-container">
                <EnvelopeSimple size={18} className="login-input-icon" />
                <input
                  id="login-email-input"
                  type="email"
                  className={`login-text-input ${validationErrors.email ? "input-error" : ""}`}
                  placeholder={
                    selectedRole === "patient"
                      ? "patient@carebridge.health"
                      : "caregiver@carebridge.health"
                  }
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (validationErrors.email) {
                      setValidationErrors((prev) => ({ ...prev, email: "" }));
                    }
                  }}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                />
              </div>
              {validationErrors.email && (
                <span className="login-input-validation-msg">{validationErrors.email}</span>
              )}
            </div>

            <div className="login-field-group">
              <label htmlFor="login-password-input" className="login-field-label">
                <span>{isTa ? "கடவுச்சொல்" : "Password"} *</span>
              </label>
              <div className="login-input-container">
                <LockKey size={18} className="login-input-icon" />
                <input
                  id="login-password-input"
                  type="password"
                  className={`login-text-input ${validationErrors.password ? "input-error" : ""}`}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (validationErrors.password) {
                      setValidationErrors((prev) => ({ ...prev, password: "" }));
                    }
                  }}
                  disabled={isLoading}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
              </div>
              {validationErrors.password && (
                <span className="login-input-validation-msg">{validationErrors.password}</span>
              )}
            </div>

            {mode === "register" && (
              <div className="login-field-group">
                <label htmlFor="login-phone-input" className="login-field-label">
                  <span>{isTa ? "தொலைபேசி எண்" : "Phone Number"}</span>
                  <span className="login-field-optional">({isTa ? "விருப்பத்தேர்வு" : "Optional"})</span>
                </label>
                <div className="login-input-container">
                  <Phone size={18} className="login-input-icon" />
                  <input
                    id="login-phone-input"
                    type="tel"
                    className="login-text-input"
                    placeholder="+91 98401 23456"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={isLoading}
                    autoComplete="tel"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="login-submit-button"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <CircleNotch size={18} className="skeleton-spinner" weight="bold" />
                  <span>{isTa ? "செயலாக்குகிறது..." : "Authenticating..."}</span>
                </>
              ) : mode === "login" ? (
                <>
                  <SignIn size={18} weight="bold" />
                  <span>
                    {selectedRole === "patient"
                      ? isTa
                        ? "நோயாளி போர்ட்டலில் உள்நுழை"
                        : "Sign In as Patient"
                      : isTa
                      ? "பராமரிப்பாளர் போர்ட்டலில் உள்நுழை"
                      : "Sign In as Caregiver"}
                  </span>
                </>
              ) : (
                <>
                  <UserPlus size={18} weight="bold" />
                  <span>
                    {selectedRole === "patient"
                      ? isTa
                        ? "நோயாளி கணக்கை உருவாக்கு"
                        : "Register as Patient"
                      : isTa
                      ? "பராமரிப்பாளர் கணக்கை உருவாக்கு"
                      : "Register as Caregiver"}
                  </span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Accounts for Hackathon Judges */}
          <div className="login-demo-divider">
            <span>{isTa ? "அல்லது விரைவு மாதிரி கணக்கு" : "Quick Synthetic Demo Login"}</span>
          </div>

          <div className="login-demo-actions">
            <button
              type="button"
              className="login-demo-card"
              onClick={() => handleDemoLogin("patient")}
              disabled={isLoading}
              title="One-click login as synthetic patient Kaviya Sundaram"
            >
              <Sparkle size={18} weight="fill" color="#0b5f5a" />
              <div>
                <div className="login-demo-card-title">
                  {isTa ? "மாதிரி நோயாளி" : "Demo Patient"}
                </div>
                <div className="login-demo-card-subtitle">Kaviya Sundaram</div>
              </div>
            </button>

            <button
              type="button"
              className="login-demo-card"
              onClick={() => handleDemoLogin("caregiver")}
              disabled={isLoading}
              title="One-click login as synthetic caregiver Dr. Anitha Nathan"
            >
              <Sparkle size={18} weight="fill" color="#16a34a" />
              <div>
                <div className="login-demo-card-title">
                  {isTa ? "மாதிரி பராமரிப்பாளர்" : "Demo Caregiver"}
                </div>
                <div className="login-demo-card-subtitle">Dr. Anitha Nathan</div>
              </div>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="login-footer">
        <p>
          Synthetic demo data for AMD Developer Hackathon ACT III. Clinicians decide.
        </p>
      </footer>
    </div>
  );
};
