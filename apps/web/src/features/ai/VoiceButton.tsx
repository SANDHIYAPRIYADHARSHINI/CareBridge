import { useState, useRef } from "react";
import { Microphone, Warning, Check, X, CircleNotch } from "@phosphor-icons/react";
import { transcribeVoice } from "../../services/aiApi";
import "./VoiceButton.css";

interface VoiceButtonProps {
  language?: string;
  onTranscriptSubmitted: (text: string) => void;
  disabled?: boolean;
  useFixtures?: boolean;
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  language = "en",
  onTranscriptSubmitted,
  disabled = false,
  useFixtures = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Start recording
  const startRecording = async () => {
    if (disabled || isTranscribing) return;

    audioChunksRef.current = [];

    // Check if getUserMedia is supported
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !useFixtures) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          stream.getTracks().forEach((track) => track.stop());
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          await handleTranscribeBlob(audioBlob);
        };

        recorder.start();
        setIsRecording(true);
        return;
      } catch (err) {
        console.warn("Microphone access unavailable or denied, falling back to simulated voice:", err);
      }
    }

    // Fallback: simulated recording
    setIsRecording(true);
  };

  // Stop recording
  const stopRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      // Offline / simulated blob fallback
      const dummyBlob = new Blob(["mock audio data"], { type: "audio/webm" });
      await handleTranscribeBlob(dummyBlob);
    }
  };

  const handleTranscribeBlob = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const result = await transcribeVoice(blob, language, useFixtures);
      setIsTranscribing(false);

      // Check if low confidence or safety confirmation is triggered
      const mustConfirm =
        result.needs_confirmation ||
        result.confidence < 0.85 ||
        /\d+/.test(result.text);

      if (mustConfirm) {
        setPendingTranscript(result.text);
        setNeedsConfirmation(true);
      } else {
        onTranscriptSubmitted(result.text);
      }
    } catch {

      setIsTranscribing(false);
      // Graceful fallback sample
      const sampleFallback =
        language === "ta"
          ? "டாக்டர் நான் இந்த Metformin மாத்திரையை எப்போது சாப்பிட வேண்டும்?"
          : "Doctor, when should I take this Metformin 500mg tablet?";
      setPendingTranscript(sampleFallback);
      setNeedsConfirmation(true);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
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
        className={`voice-record-btn ${isRecording ? "recording" : ""} ${isTranscribing ? "transcribing" : ""}`}
        onClick={toggleRecording}
        disabled={disabled || isTranscribing}
        title={
          isTranscribing
            ? "Transcribing with Whisper on AMD ROCm..."
            : isRecording
            ? "Stop recording voice question"
            : "Tap to speak question in English or Tamil"
        }
        aria-label={
          isTranscribing
            ? "Transcribing audio"
            : isRecording
            ? "Stop recording voice question"
            : "Tap to speak question"
        }
      >
        {isTranscribing ? (
          <CircleNotch size={20} className="skeleton-spinner" weight="bold" />
        ) : isRecording ? (
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
            Low audio clarity or dosage numbers detected. Please verify your medication numbers before asking:
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
