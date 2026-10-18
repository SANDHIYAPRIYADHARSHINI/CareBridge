import React, { useState } from "react";
import {
  X,
  User as UserIcon,
  ShieldCheck,
  LockKey,
  EnvelopeSimple,
  Phone,
  SignIn,
  UserPlus,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useAuth } from "./AuthContext";
import type { User, UserRole } from "../../types/backend";
import "./AuthModal.css";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: string;
  defaultRole?: UserRole;
  onSuccess?: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  language,
  defaultRole = "patient",
  onSuccess,
}) => {
  const { login, register, loginAsDemo, error, clearError, isLoading } = useAuth();
  const isTa = language === "ta";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password.trim()) {
      setLocalError(
        isTa ? "மின்னஞ்சல் மற்றும் கடவுச்சொல் தேவை" : "Email and password are required"
      );
      return;
    }

    if (mode === "register" && !fullName.trim()) {
      setLocalError(isTa ? "முழு பெயர் தேவை" : "Full name is required");
      return;
    }

    try {
      let authedUser: User;
      if (mode === "login") {
        authedUser = await login(email, password);
      } else {
        authedUser = await register({
          email,
          password,
          full_name: fullName,
          role,
          phone_number: phoneNumber || undefined,
        });
      }
      if (onSuccess) onSuccess(authedUser);
      onClose();
    } catch {
      // Error handled by context or displayed via error state
    }
  };

  const handleDemoSignIn = async (demoRole: "patient" | "caregiver") => {
    setLocalError(null);
    clearError();
    try {
      const authedUser = await loginAsDemo(demoRole);
      if (onSuccess) onSuccess(authedUser);
      onClose();
    } catch {
      // Ignored
    }
  };

  const displayedError = localError || error;

  return (
    <div className="auth-modal-overlay" role="dialog" aria-modal="true">
      <div className="auth-modal-card">
        {/* Header */}
        <div className="auth-modal-header">
          <div className="auth-header-title-row">
            <div className="auth-brand-badge">
              <ShieldCheck size={20} weight="fill" />
              <span>CareBridge Security</span>
            </div>
            <button
              type="button"
              className="auth-modal-close"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
          <h2 className="auth-modal-title">
            {mode === "login"
              ? isTa
                ? "கணக்கில் உள்நுழைக"
                : "Sign In to CareBridge"
              : isTa
              ? "புதிய கணக்கை உருவாக்கவும்"
              : "Create Your Account"}
          </h2>
          <p className="auth-modal-subtitle">
            {isTa
              ? "பாதுகாப்பான மற்றும் தனியுரிமை-முதன்மையான நோயாளி & பராமரிப்பாளர் அணுகல்"
              : "Role-based authorization with end-to-end patient consent governance"}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="auth-tabs-row">
          <button
            type="button"
            className={`auth-tab-btn ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              clearError();
            }}
          >
            <SignIn size={16} weight="bold" />
            <span>{isTa ? "உள்நுழை" : "Sign In"}</span>
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${mode === "register" ? "active" : ""}`}
            onClick={() => {
              setMode("register");
              clearError();
            }}
          >
            <UserPlus size={16} weight="bold" />
            <span>{isTa ? "பதிவு செய்" : "Register"}</span>
          </button>
        </div>

        {/* Role Selection */}
        <div className="auth-role-select-box">
          <span className="auth-role-label">
            {isTa ? "கணக்கு வகை (Role):" : "Account Role:"}
          </span>
          <div className="auth-role-buttons">
            <button
              type="button"
              className={`auth-role-chip ${role === "patient" ? "active" : ""}`}
              onClick={() => setRole("patient")}
            >
              <UserIcon size={16} weight="bold" />
              <span>{isTa ? "நோயாளி (Patient)" : "Patient"}</span>
            </button>
            <button
              type="button"
              className={`auth-role-chip ${role === "caregiver" ? "active" : ""}`}
              onClick={() => setRole("caregiver")}
            >
              <ShieldCheck size={16} weight="bold" />
              <span>{isTa ? "பராமரிப்பாளர் (Caregiver)" : "Caregiver"}</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {displayedError && (
          <div className="auth-error-banner">
            <WarningCircle size={18} weight="fill" />
            <span>{displayedError}</span>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <div className="auth-input-group">
              <label htmlFor="auth-name" className="auth-label">
                {isTa ? "முழு பெயர்" : "Full Name"}
              </label>
              <div className="auth-input-wrapper">
                <UserIcon size={18} className="auth-input-icon" />
                <input
                  id="auth-name"
                  type="text"
                  className="auth-input"
                  placeholder={
                    role === "patient" ? "Kaviya Sundaram" : "Dr. Anitha Nathan"
                  }
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <div className="auth-input-group">
            <label htmlFor="auth-email" className="auth-label">
              {isTa ? "மின்னஞ்சல் முகவரி" : "Email Address"}
            </label>
            <div className="auth-input-wrapper">
              <EnvelopeSimple size={18} className="auth-input-icon" />
              <input
                id="auth-email"
                type="email"
                className="auth-input"
                placeholder={
                  role === "patient"
                    ? "kaviya.sundaram@example.com"
                    : "anitha.nathan@example.com"
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <div className="auth-input-group">
            <label htmlFor="auth-password" className="auth-label">
              {isTa ? "கடவுச்சொல்" : "Password"}
            </label>
            <div className="auth-input-wrapper">
              <LockKey size={18} className="auth-input-icon" />
              <input
                id="auth-password"
                type="password"
                className="auth-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
          </div>

          {mode === "register" && (
            <div className="auth-input-group">
              <label htmlFor="auth-phone" className="auth-label">
                {isTa ? "தொலைபேசி எண் (விருப்பத்தேர்வு)" : "Phone Number (Optional)"}
              </label>
              <div className="auth-input-wrapper">
                <Phone size={18} className="auth-input-icon" />
                <input
                  id="auth-phone"
                  type="tel"
                  className="auth-input"
                  placeholder="+91 98401 23456"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <span>{isTa ? "செயலாக்குகிறது..." : "Processing..."}</span>
            ) : mode === "login" ? (
              <span>
                {role === "patient"
                  ? isTa
                    ? "நோயாளி போர்ட்டலில் உள்நுழை"
                    : "Sign In as Patient"
                  : isTa
                  ? "பராமரிப்பாளர் போர்ட்டலில் உள்நுழை"
                  : "Sign In as Caregiver"}
              </span>
            ) : (
              <span>
                {role === "patient"
                  ? isTa
                    ? "நோயாளி கணக்கை உருவாக்கு"
                    : "Create Patient Account"
                  : isTa
                  ? "பராமரிப்பாளர் கணக்கை உருவாக்கு"
                  : "Create Caregiver Account"}
              </span>
            )}
          </button>
        </form>

        {/* Quick Demo Section */}
        <div className="auth-demo-divider">
          <span>{isTa ? "அல்லது விரைவு மாதிரி கணக்கு" : "Or Quick Synthetic Demo Login"}</span>
        </div>

        <div className="auth-demo-buttons-row">
          <button
            type="button"
            className="auth-demo-chip"
            onClick={() => handleDemoSignIn("patient")}
            disabled={isLoading}
          >
            <Sparkle size={16} weight="fill" color="#0284c7" />
            <div>
              <div className="demo-chip-title">
                {isTa ? "நோயாளி மாதிரி கணக்கு" : "Demo Patient Account"}
              </div>
              <div className="demo-chip-sub">Kaviya Sundaram</div>
            </div>
          </button>

          <button
            type="button"
            className="auth-demo-chip"
            onClick={() => handleDemoSignIn("caregiver")}
            disabled={isLoading}
          >
            <Sparkle size={16} weight="fill" color="#16a34a" />
            <div>
              <div className="demo-chip-title">
                {isTa ? "பராமரிப்பாளர் மாதிரி கணக்கு" : "Demo Caregiver Account"}
              </div>
              <div className="demo-chip-sub">Dr. Anitha Nathan</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
