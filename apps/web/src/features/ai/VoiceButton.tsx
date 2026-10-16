import { useState } from "react";
import { Microphone, Warning, Check, X } from "@phosphor-icons/react";
import "./VoiceButton.css";

interface VoiceButtonProps {
  language?: "en" | "ta";
  onTranscriptSubmitted: (text: string) => void;
  disabled?: boolean;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  language = "en",
  onTranscriptSubmitted,
  disabled = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  // Toggle record / stop
  const toggleRecording = () => {
    if (disabled) return;

    if (!isRecording) {
      setIsRecording(true);
      // Simulate real-time audio capture
    } else {
      setIsRecording(false);
      // Simulate Whisper transcription output
      const sampleTranscript =
        language === "ta"
          ? "டாக்டர் நான் இந்த Metformin 500mg மாத்திரையை 2 வேளை எடுக்கலாமா?"
          : "Doctor, when should I take this Metformin 500mg tablet?";

      // Low confidence trigger demonstration: if inquiry contains numbers, test confirm step
      const simulatedLowConfidence = true;
      setPendingTranscript(sampleTranscript);
      setNeedsConfirmation(simulatedLowConfidence);

      if (!simulatedLowConfidence) {
        onTranscriptSubmitted(sampleTranscript);
        setPendingTranscript(null);
      }
    }
  };

  const handleConfirm = () => {
    if (pendingTranscript) {
      onTranscriptSubmitted(pendingTranscript);
    }
    setPendingTranscript(null);
    setNeedsConfirmation(false);
  };

  const handleCancel = () => {
    setPendingTranscript(null);
    setNeedsConfirmation(false);
  };

  // Highlights numbers in transcript per VO-5
  const renderHighlightedTranscript = (text: string) => {
    const parts = text.split(/(\d+(?:\.\d+)?(?:mg|ml)?)/gi);
    return parts.map((part, i) =>
      /^\d+(?:\.\d+)?(?:mg|ml)?$/i.test(part) ? (
        <mark key={i}>{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  return (
    <div className="voice-button-wrapper">
      <button
        type="button"
        className={`voice-record-btn ${isRecording ? "recording" : ""}`}
        onClick={toggleRecording}
        disabled={disabled}
        title={isRecording ? "Stop recording voice question" : "Tap to speak question"}
        aria-label={isRecording ? "Stop recording voice question" : "Tap to speak question"}
      >
        {isRecording ? (
          <div className="waveform-bars">
            <span className="waveform-bar"></span>
            <span className="waveform-bar"></span>
            <span className="waveform-bar"></span>
            <span className="waveform-bar"></span>
          </div>
        ) : (
          <Microphone size={20} weight="fill" />
        )}
      </button>

      {/* Low confidence transcript confirmation step per docs/safety.md */}
      {needsConfirmation && pendingTranscript && (
        <div className="transcript-confirm-overlay" role="dialog" aria-label="Confirm voice transcription">
          <div className="confirm-header">
            <Warning size={17} weight="bold" />
            <span>Confirm spoken question</span>
          </div>

          <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)", marginBottom: "0.4rem" }}>
            Low audio clarity detected. Please verify your medication numbers before asking:
          </p>

          <div className="transcript-quote" lang={language}>
            "{renderHighlightedTranscript(pendingTranscript)}"
          </div>

          <div className="confirm-actions">
            <button className="confirm-cancel-btn" onClick={handleCancel}>
              <X size={14} /> Cancel
            </button>
            <button className="confirm-submit-btn" onClick={handleConfirm}>
              <Check size={14} weight="bold" /> Confirm & Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
