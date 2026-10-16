import { useEffect, useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";

interface SkeletonLoaderProps {
  stage?: "reading" | "checking" | "grounding" | "complete";
  customMessage?: string;
}

const NARRATIVE_STAGES = [
  "Scanning prescription image...",
  "Reading OCR text lines and bounding boxes...",
  "Extracting medications, strengths, and frequencies...",
  "Checking each field against the source text...",
  "Validating prescription safety rules...",
];

export const SkeletonLoader = ({ customMessage }: SkeletonLoaderProps) => {
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % NARRATIVE_STAGES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="skeleton-narrative-container" role="status" aria-live="polite">
      <div className="skeleton-icon-wrapper">
        <CircleNotch size={28} className="skeleton-spinner" weight="bold" />
      </div>
      <div className="skeleton-text-wrapper">
        <p className="skeleton-narrative-message">
          {customMessage || NARRATIVE_STAGES[currentIdx]}
        </p>
        <span className="skeleton-subtext">Verified by deterministic rules — not guessing</span>
      </div>
      <div className="skeleton-bars">
        <div className="skeleton-bar-line short"></div>
        <div className="skeleton-bar-line medium"></div>
        <div className="skeleton-bar-line long"></div>
      </div>
    </div>
  );
};
