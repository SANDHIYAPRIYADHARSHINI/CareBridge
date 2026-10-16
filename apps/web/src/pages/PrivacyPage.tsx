import { ArrowLeft, ShieldCheck, LockKey, EyeSlash, Cpu, Heartbeat } from "@phosphor-icons/react";
import "./pages.css";

interface PrivacyPageProps {
  onBack: () => void;
  language?: "en" | "ta";
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onBack, language = "en" }) => {
  return (
    <div className="page-container" lang={language}>
      <header className="page-header">
        <button type="button" className="page-back-btn" onClick={onBack}>
          <ArrowLeft size={16} weight="bold" />
          <span>{language === "ta" ? "செயலிக்குத் திரும்பு" : "Back to CareBridge"}</span>
        </button>
        <span className="page-category">Clinical Privacy & Safety</span>
        <h1 className="page-title">
          {language === "ta" ? "தனியுரிமை மற்றும் பாதுகாப்பு நெறிமுறைகள்" : "Privacy Policy & Safety Principles"}
        </h1>
        <p className="page-subtitle">
          {language === "ta"
            ? "கேர்பிரிட்ஜ் AI நோயாளியின் பாதுகாப்பிற்கு முன்னுரிமை அளிக்கிறது. தரவு சேமிப்பற்ற (Zero-Retention) மற்றும் ஏஎம்டி ROCm தனிமைப்படுத்தப்பட்ட முறையில் இயங்குகிறது."
            : "CareBridge AI is designed with non-negotiable patient safety guarantees: stateless zero-retention processing, strictly grounded citations, and instant emergency escalation."}
        </p>
      </header>

      <main className="page-content">
        <section className="policy-card">
          <div className="policy-icon-title">
            <LockKey size={24} color="var(--primary)" weight="bold" />
            <h2>Zero-Retention Stateless Architecture</h2>
          </div>
          <p>
            The CareBridge AI inference service is entirely stateless. We do not persist uploaded prescription images,
            extracted medication fields, or chat transcripts into a database. All processing happens in-memory
            during your active session and is purged immediately upon completion.
          </p>
        </section>

        <section className="policy-card">
          <div className="policy-icon-title">
            <EyeSlash size={24} color="var(--primary)" weight="bold" />
            <h2>No Hallucination: Grounded by Deterministic Rules</h2>
          </div>
          <p>
            CareBridge AI adheres to the principle of <em>"Never Guess"</em>. If a dosage, timing, or strength is illegible
            or missing from your prescription, our system marks it as <code>missing</code> or <code>unclear</code> with an
            amber verification badge. We never invent medical details. Every extracted field carries explicit evidence
            pointing to source OCR lines.
          </p>
        </section>

        <section className="policy-card">
          <div className="policy-icon-title">
            <Heartbeat size={24} color="var(--danger)" weight="bold" />
            <h2>Safety Escalation & Emergency Bypasses</h2>
          </div>
          <p>
            Our system is strictly an information companion, not a medical doctor:
          </p>
          <ul className="policy-list">
            <li>
              <strong>Level 3 (Life-Threatening Symptoms):</strong> Queries mentioning severe chest pain, breathing difficulties,
              or crisis immediately bypass the LLM and display direct emergency telephone links (Ambulance 108 / Emergency 112).
            </li>
            <li>
              <strong>Level 2 (Clinical Judgment):</strong> Inquiries requesting dosage changes or medication discontinuation are
              calmly refused with safe guidance to consult your treating physician or dispensary pharmacist.
            </li>
          </ul>
        </section>

        <section className="policy-card">
          <div className="policy-icon-title">
            <Cpu size={24} color="var(--primary)" weight="bold" />
            <h2>AMD ROCm Infrastructure & Synthetic Demo Data</h2>
          </div>
          <p>
            In compliance with the AMD Developer Hackathon requirements, all AI and VLM workloads are powered by
            AMD Instinct™ GPUs using ROCm on isolated infrastructure. All demonstration prescriptions, patient names,
            and doctor credentials displayed in this demo are entirely synthetic fixtures. No real Protected Health
            Information (PHI) is ever used or displayed.
          </p>
        </section>

        <section className="policy-card medical-disclaimer-box">
          <div className="policy-icon-title">
            <ShieldCheck size={24} color="var(--ok)" weight="bold" />
            <h2>Medical Disclaimer</h2>
          </div>
          <p>
            <strong>Synthetic demo data. Not medical advice. Clinicians decide.</strong>
            CareBridge AI is designed to support patient comprehension and medication adherence. It does not provide medical
            diagnoses or treatment decisions. Always follow the explicit instructions provided by your licensed healthcare provider.
          </p>
        </section>
      </main>

      <footer className="page-footer">
        <button type="button" className="page-return-action" onClick={onBack}>
          <ArrowLeft size={16} weight="bold" />
          <span>Return to Application</span>
        </button>
      </footer>
    </div>
  );
};
