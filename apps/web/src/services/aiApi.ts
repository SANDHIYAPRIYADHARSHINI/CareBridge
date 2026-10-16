import type {
  ExtractionResult,
  ChatRequest,
  ChatResponse,
  TranscribeResponse,
  ApiErrorDetail,
} from "../types/ai";
import {
  extractionOkFixture,
  extractionFlaggedFixture,
  chatSupportedFixture,
  chatEmergencyL3Fixture,
  chatRefusalL2Fixture,
} from "../fixtures";

export class AiApiError extends Error {
  code: string;
  retryable?: boolean;
  status?: number;

  constructor(message: string, code = "internal_error", status?: number, retryable = false) {
    super(message);
    this.name = "AiApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function getAiBaseUrl(): string {
  return import.meta.env.VITE_AI_BASE_URL || "http://localhost:8100";
}

export function isEnvUseFixtures(): boolean {
  return import.meta.env.VITE_USE_FIXTURES === "true";
}

/**
 * Extracts structured medication data and OCR lines from a prescription file.
 */
export async function extractPrescription(
  file: File | Blob,
  fileName = "prescription.png",
  languageHint = "auto",
  useFixtures = false
): Promise<ExtractionResult> {
  if (useFixtures) {
    // Simulate brief realistic processing delay
    await new Promise((r) => setTimeout(r, 1200));
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes("002") || lowerName.includes("clean") || lowerName.includes("ok")) {
      return extractionOkFixture;
    }
    return extractionFlaggedFixture;
  }

  const baseUrl = getAiBaseUrl();
  const formData = new FormData();
  formData.append("file", file, fileName);
  if (languageHint) {
    formData.append("language_hint", languageHint);
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/prescriptions/extract`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new AiApiError(
      "Could not reach the CareBridge AI service. Please verify your connection or switch to synthetic demo mode.",
      "network_error",
      0,
      true
    );
  }

  if (!res.ok) {
    let errorDetail: ApiErrorDetail | null = null;
    try {
      errorDetail = await res.json();
    } catch {
      // not json
    }

    const code = errorDetail?.error?.code || (res.status === 503 ? "model_unavailable" : "api_error");
    const message =
      errorDetail?.error?.message ||
      (res.status === 503
        ? "The live AI extraction model is currently unavailable on AMD ROCm."
        : `Extraction failed with status ${res.status}`);
    const retryable = errorDetail?.error?.retryable ?? false;

    throw new AiApiError(message, code, res.status, retryable);
  }

  return (await res.json()) as ExtractionResult;
}

/**
 * Sends conversation messages and confirmed clinical documents to the chat companion.
 */
export async function sendChatMessage(
  request: ChatRequest,
  useFixtures = false
): Promise<ChatResponse> {
  if (useFixtures) {
    await new Promise((r) => setTimeout(r, 600));
    const lastMsg = request.messages[request.messages.length - 1]?.content.toLowerCase() || "";
    if (
      lastMsg.includes("chest pain") ||
      lastMsg.includes("cannot breathe") ||
      lastMsg.includes("நெஞ்சு வலி") ||
      lastMsg.includes("மூச்சு")
    ) {
      return chatEmergencyL3Fixture;
    }
    if (
      lastMsg.includes("stop") ||
      lastMsg.includes("change dose") ||
      lastMsg.includes("double") ||
      lastMsg.includes("நிறுத்தலாமா")
    ) {
      return chatRefusalL2Fixture;
    }
    return chatSupportedFixture;
  }

  const baseUrl = getAiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new AiApiError(
      "Could not reach the CareBridge chat service. Please check your network or try again.",
      "network_error",
      0,
      true
    );
  }

  if (!res.ok) {
    let errorDetail: ApiErrorDetail | null = null;
    try {
      errorDetail = await res.json();
    } catch {
      // ignore
    }
    const code = errorDetail?.error?.code || "chat_failed";
    const message = errorDetail?.error?.message || `Chat failed with HTTP ${res.status}`;
    throw new AiApiError(message, code, res.status);
  }

  return (await res.json()) as ChatResponse;
}

/**
 * Transcribes audio via Whisper endpoint.
 */
export async function transcribeVoice(
  audioBlob: Blob,
  languageHint = "ta",
  useFixtures = false
): Promise<TranscribeResponse> {
  if (useFixtures) {
    await new Promise((r) => setTimeout(r, 500));
    const isTa = languageHint === "ta";
    return {
      request_id: "req-voice-mock",
      text: isTa
        ? "டாக்டர் நான் இந்த மாத்திரையை எப்போது சாப்பிட வேண்டும்?"
        : "Doctor, when should I take this tablet?",
      language: languageHint,
      confidence: 0.94,
      needs_confirmation: false,
      metrics: {
        latency_ms: 180.5,
        model: "openai/whisper-large-v3",
        gpu: "AMD Instinct MI300X",
      },
    };
  }

  const baseUrl = getAiBaseUrl();
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice_input.webm");
  if (languageHint) {
    formData.append("language_hint", languageHint);
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/v1/voice/transcribe`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new AiApiError(
      "Voice transcription service unreachable. Falling back to simulated input.",
      "network_error",
      0,
      true
    );
  }

  if (!res.ok) {
    let errorDetail: ApiErrorDetail | null = null;
    try {
      errorDetail = await res.json();
    } catch {
      // ignore
    }
    const code = errorDetail?.error?.code || "transcription_failed";
    const message = errorDetail?.error?.message || `Voice transcription failed with HTTP ${res.status}`;
    throw new AiApiError(message, code, res.status);
  }

  return (await res.json()) as TranscribeResponse;
}
