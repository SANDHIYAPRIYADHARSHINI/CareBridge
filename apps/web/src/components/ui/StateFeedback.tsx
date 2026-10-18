import React from "react";
import {
  CircleNotch,
  WarningCircle,
  FolderSimpleMinus,
  CheckCircle,
  ArrowClockwise,
} from "@phosphor-icons/react";
import "./StateFeedback.css";

export type FeedbackState = "loading" | "error" | "empty" | "success";

interface StateFeedbackProps {
  state: FeedbackState;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export const StateFeedback: React.FC<StateFeedbackProps> = ({
  state,
  title,
  message,
  actionLabel,
  onAction,
  className = "",
  children,
}) => {
  return (
    <div className={`state-feedback-container state-${state} ${className}`} role="status">
      {state === "loading" && (
        <div className="state-feedback-card loading-card">
          <CircleNotch size={32} weight="bold" className="state-spin-icon" />
          <h4 className="state-title">{title || "Loading clinical data..."}</h4>
          {message && <p className="state-message">{message}</p>}
        </div>
      )}

      {state === "error" && (
        <div className="state-feedback-card error-card">
          <div className="state-icon-circle error-circle">
            <WarningCircle size={28} weight="fill" />
          </div>
          <h4 className="state-title">{title || "Failed to load information"}</h4>
          <p className="state-message">
            {message || "Could not retrieve clinical records. Please verify your connection or switch to synthetic mode."}
          </p>
          {actionLabel && onAction && (
            <button type="button" className="state-action-btn error-btn" onClick={onAction}>
              <ArrowClockwise size={16} weight="bold" />
              <span>{actionLabel}</span>
            </button>
          )}
        </div>
      )}

      {state === "empty" && (
        <div className="state-feedback-card empty-card">
          <div className="state-icon-circle empty-circle">
            <FolderSimpleMinus size={28} weight="duotone" />
          </div>
          <h4 className="state-title">{title || "No records found"}</h4>
          <p className="state-message">{message || "There are no active records in this section yet."}</p>
          {actionLabel && onAction && (
            <button type="button" className="state-action-btn primary-btn" onClick={onAction}>
              {actionLabel}
            </button>
          )}
        </div>
      )}

      {state === "success" && (
        <div className="state-feedback-card success-card">
          <div className="state-icon-circle success-circle">
            <CheckCircle size={28} weight="fill" />
          </div>
          <h4 className="state-title">{title || "Action completed successfully"}</h4>
          {message && <p className="state-message">{message}</p>}
          {actionLabel && onAction && (
            <button type="button" className="state-action-btn success-btn" onClick={onAction}>
              {actionLabel}
            </button>
          )}
        </div>
      )}

      {children}
    </div>
  );
};
