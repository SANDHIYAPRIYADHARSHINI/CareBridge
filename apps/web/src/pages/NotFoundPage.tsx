import { ArrowLeft, Compass } from "@phosphor-icons/react";
import "./pages.css";

interface NotFoundPageProps {
  onBack: () => void;
  language?: "en" | "ta";
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onBack, language = "en" }) => {
  return (
    <div className="page-container not-found-page" lang={language}>
      <div className="not-found-card">
        <div className="not-found-icon-circle">
          <Compass size={40} color="var(--primary)" weight="duotone" />
        </div>

        <span className="not-found-code">404</span>

        <h1 className="not-found-title">
          {language === "ta" ? "பக்கம் கிடைக்கவில்லை" : "Page Not Found"}
        </h1>

        <p className="not-found-desc">
          {language === "ta"
            ? "நீங்கள் தேடும் பக்கம் கிடைக்கவில்லை அல்லது இடமாற்றம் செய்யப்பட்டுள்ளது."
            : "The page or clinical resource you are looking for does not exist or may have been moved."}
        </p>

        <button type="button" className="not-found-action-btn" onClick={onBack}>
          <ArrowLeft size={18} weight="bold" />
          <span>{language === "ta" ? "செயலிக்குத் திரும்பு" : "Return to CareBridge Companion"}</span>
        </button>
      </div>
    </div>
  );
};
