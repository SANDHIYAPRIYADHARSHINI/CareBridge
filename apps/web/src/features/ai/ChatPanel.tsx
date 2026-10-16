import { useState } from "react";
import {
  PaperPlaneRight,
  ChatCircleText,
  Warning,
  PhoneCall,
  MapPin,
  NotePencil,
  FirstAid,
  Heartbeat,
  Check,
} from "@phosphor-icons/react";
import type { ChatResponse, Citation } from "../../types/ai";
import { VoiceButton } from "./VoiceButton";
import {
  chatEmergencyL3Fixture,
  chatRefusalL2Fixture,
  chatSupportedFixture,
} from "../../fixtures";
import { EMERGENCY_CONFIG } from "../../config/emergency";
import "./ChatPanel.css";


interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  responseMeta?: ChatResponse;
}

interface ChatPanelProps {
  language?: "en" | "ta";
  onCitationClick?: (lineIds: string[]) => void;
  onLanguageChange?: (lang: "en" | "ta") => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  language = "en",
  onCitationClick,
  onLanguageChange,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m-1",
      sender: "assistant",
      text:
        language === "ta"
          ? "வணக்கம்! உங்கள் மருத்துவ ஆவணங்கள் அடிப்படையில் உங்கள் மருந்து மற்றும் நேரம் குறித்து என்னிடம் கேட்கலாம்."
          : "Hello! I am your care companion. You can ask me when to take your medicines or explain instructions from your prescription.",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [emergencyPayload, setEmergencyPayload] = useState<ChatResponse | null>(null);
  const [noteAdded, setNoteAdded] = useState(false);

  // Send message simulation
  const handleSendMessage = (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");

    // Simulate response based on safety routing
    const qLower = query.toLowerCase();

    // L3 Emergency check
    if (
      qLower.includes("chest pain") ||
      qLower.includes("cannot breathe") ||
      qLower.includes("நெஞ்சு வலி") ||
      qLower.includes("மூச்சு")
    ) {
      setEmergencyPayload(chatEmergencyL3Fixture);
      setEmergencyModalOpen(true);
      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: chatEmergencyL3Fixture.answer,
        responseMeta: chatEmergencyL3Fixture,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      return;
    }

    // L2 Clinical advice check
    if (
      qLower.includes("stop") ||
      qLower.includes("change dose") ||
      qLower.includes("double") ||
      qLower.includes("நிறுத்தலாமா")
    ) {
      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: chatRefusalL2Fixture.answer,
        responseMeta: chatRefusalL2Fixture,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      return;
    }

    // Default L0 Grounded response
    const assistantMsg: ChatMessage = {
      id: `asst-${Date.now()}`,
      sender: "assistant",
      text: chatSupportedFixture.answer,
      responseMeta: chatSupportedFixture,
    };
    setMessages((prev) => [...prev, assistantMsg]);
  };

  const handleCitationChipClick = (cid: string, citations?: Citation[]) => {
    if (!citations) return;
    const found = citations.find((c) => c.id === cid);
    if (found && onCitationClick) {
      onCitationClick(found.line_ids);
    }
  };

  // Render plain text with clickable [c1], [c2] citation markers
  const renderMessageContent = (msg: ChatMessage) => {
    const citations = msg.responseMeta?.citations || [];
    const parts = msg.text.split(/(\[c\d+\])/g);

    return parts.map((part, index) => {
      const match = part.match(/\[(c\d+)\]/);
      if (match) {
        const cid = match[1];
        return (
          <button
            key={index}
            type="button"
            className="citation-chip"
            onClick={() => handleCitationChipClick(cid, citations)}
            title={`Highlight evidence source line for ${cid}`}
            aria-label={`Citation ${cid}, click to highlight in prescription`}
          >
            {cid}
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="chat-panel-container" aria-label="Care companion chat interface">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-title">
          <ChatCircleText size={22} color="var(--primary)" weight="bold" />
          <span>Ask CareBridge</span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {onLanguageChange && (
            <button
              type="button"
              className="lang-toggle-btn"
              onClick={() => onLanguageChange(language === "en" ? "ta" : "en")}
              title="Toggle language"
            >
              {language === "en" ? "தமிழ்" : "English"}
            </button>
          )}
        </div>
      </div>

      {/* Message Thread */}
      <div className="chat-thread" role="log" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.sender}`}>
            <span className="message-sender">
              {msg.sender === "user" ? "You" : "CareBridge Companion"}
            </span>

            <div className="message-bubble" lang={language}>
              {renderMessageContent(msg)}
            </div>

            {/* Citations references list */}
            {msg.responseMeta && msg.responseMeta.citations.length > 0 && (
              <div className="citations-footer-list">
                {msg.responseMeta.citations.map((c) => (
                  <div
                    key={c.id}
                    className="citation-card"
                    onClick={() => onCitationClick && onCitationClick(c.line_ids)}
                  >
                    <strong>[{c.id}]</strong> "{c.quote}"
                  </div>
                ))}
              </div>
            )}

            {/* L2 Clinical Escalation Banner per docs/design.md */}
            {msg.responseMeta?.escalation.level === "L2" && (
              <div className="escalation-l2-banner" role="alert">
                <div className="escalation-header">
                  <Warning size={19} weight="bold" color="var(--warn)" />
                  <span>Clinical Judgment Required</span>
                </div>
                <p style={{ fontSize: "0.88rem", marginBottom: "0.2rem" }}>
                  {msg.responseMeta.escalation.reason ||
                    "This request requires physician or pharmacist guidance."}
                </p>

                <div className="escalation-actions">
                  <button
                    type="button"
                    className="action-btn-secondary"
                    onClick={() => setNoteAdded(true)}
                  >
                    {noteAdded ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--ok)" }}>
                        <Check size={14} weight="bold" /> Added to appointment notes
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <NotePencil size={14} /> Add to appointment notes
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    className="action-btn-secondary"
                    onClick={() => alert("Pharmacist helpline shortcut: Call local dispensary")}
                  >
                    <FirstAid size={14} /> Contact Pharmacist
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick Prompt Chips */}
      <div className="quick-prompts-bar">
        <button
          type="button"
          className="quick-chip"
          onClick={() => handleSendMessage("When should I take Metformin?")}
        >
          When to take Metformin?
        </button>
        <button
          type="button"
          className="quick-chip"
          onClick={() => handleSendMessage("Can I stop Metformin because I feel better?")}
        >
          Can I stop Metformin? (L2 test)
        </button>
        <button
          type="button"
          className="quick-chip"
          onClick={() => handleSendMessage("I have severe crushing chest pain!")}
        >
          Chest pain emergency! (L3 test)
        </button>
      </div>

      {/* Chat Input Bar */}
      <form
        className="chat-input-area"
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
      >
        <input
          type="text"
          className="chat-input-field"
          placeholder={language === "ta" ? "உங்கள் கேள்வியைத் தட்டச்சு செய்யவும்..." : "Ask about your medication, timing, or dosage..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />

        <VoiceButton
          language={language}
          onTranscriptSubmitted={(transcript) => handleSendMessage(transcript)}
        />

        <button
          type="submit"
          className="chat-send-btn"
          disabled={!inputText.trim()}
          title="Send message"
          aria-label="Send message"
        >
          <PaperPlaneRight size={18} weight="bold" />
        </button>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* L3 Full-Screen Emergency Modal Takeover per docs/design.md         */}
      {/* ------------------------------------------------------------------ */}
      {emergencyModalOpen && (
        <div className="emergency-takeover-overlay" role="alertdialog" aria-modal="true">
          <div className="emergency-panel-card">
            <div className="emergency-badge">
              <Heartbeat size={16} weight="bold" />
              <span>Emergency Detected — LLM Bypassed</span>
            </div>

            <h1 className="emergency-title">Possible Medical Emergency</h1>

            <p className="emergency-explanation">
              {emergencyPayload?.answer ||
                "This sounds like a life-threatening medical emergency. Please call emergency services immediately or visit the nearest emergency room."}
            </p>

            {/* Big Emergency Call Button from centralized TO_VERIFY config */}
            <a
              href={`tel:${EMERGENCY_CONFIG.ambulance.number}`}
              className="emergency-call-btn"
            >
              <PhoneCall size={26} weight="bold" />
              <span>
                {language === "ta"
                  ? `${EMERGENCY_CONFIG.ambulance.labelTa}: ${EMERGENCY_CONFIG.ambulance.number}`
                  : `Call Emergency: ${EMERGENCY_CONFIG.ambulance.number}`}
              </span>
            </a>


            <div className="emergency-secondary-row">
              <a href={`tel:${EMERGENCY_CONFIG.teleManas.number}`} className="emergency-sub-btn">
                <PhoneCall size={18} />
                <span>
                  {language === "ta"
                    ? `${EMERGENCY_CONFIG.teleManas.labelTa} (${EMERGENCY_CONFIG.teleManas.number})`
                    : `Tele-MANAS (${EMERGENCY_CONFIG.teleManas.number})`}
                </span>
              </a>


              <button
                type="button"
                className="emergency-sub-btn"
                onClick={() => alert("Routing to nearest emergency room...")}
              >
                <MapPin size={18} />
                <span>Nearest Hospital</span>
              </button>
            </div>

            <button
              type="button"
              className="emergency-dismiss-link"
              onClick={() => setEmergencyModalOpen(false)}
            >
              Return to app (only if safe to do so)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
