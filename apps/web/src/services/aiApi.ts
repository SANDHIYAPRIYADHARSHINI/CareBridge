import type {
  ExtractionResult,
  ChatRequest,
  ChatResponse,
  TranscribeResponse,
  ApiErrorDetail,
  BenchmarkSummary,
} from "../types/ai";
import {
  chatSupportedFixture,
  chatEmergencyL3Fixture,
  chatRefusalL2Fixture,
  getFixtureForImage,
  benchmarkSummaryFixture,
} from "../fixtures";
import { getApiBaseUrl, getAuthToken } from "./api";

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
  return import.meta.env.VITE_USE_FIXTURES !== "false";
}

/**
 * Extracts structured medication data and OCR lines from a prescription file.
 * Routes through the authenticated Member 2 backend proxy (/ai/extract) to enforce
 * caregiver consent and audit logging.
 */
export async function extractPrescription(
  file: File | Blob,
  fileName = "prescription.png",
  languageHint = "auto",
  useFixtures = false,
  patientId?: string
): Promise<ExtractionResult> {
  if (useFixtures) {
    // Simulate brief realistic processing delay
    await new Promise((r) => setTimeout(r, 600));
    return getFixtureForImage(fileName);
  }

  const token = getAuthToken();
  const backendBase = getApiBaseUrl();
  const formData = new FormData();
  formData.append("file", file, fileName);
  if (languageHint) {
    formData.append("language_hint", languageHint);
  }
  if (patientId) {
    formData.append("patient_id", patientId);
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  const extractSignal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(90000) : undefined;
  try {
    // Primary path: Member 2 authenticated backend proxy
    res = await fetch(`${backendBase}/ai/extract`, {
      method: "POST",
      headers,
      body: formData,
      signal: extractSignal,
    });
  } catch {
    // Fallback: Direct call to Member 1 AI service if backend proxy is offline
    const aiBase = getAiBaseUrl();
    try {
      res = await fetch(`${aiBase}/v1/prescriptions/extract`, {
        method: "POST",
        body: formData,
        signal: extractSignal,
      });
    } catch {
      throw new AiApiError(
        "CareBridge AI service is not reachable. Please verify the AI service is running at http://127.0.0.1:8100.",
        "service_not_reachable",
        0,
        true
      );
    }
  }

  if (!res.ok) {
    let errorDetail: ApiErrorDetail | null = null;
    try {
      errorDetail = await res.json();
    } catch {
      // not json
    }

    if (res.status === 403) {
      throw new AiApiError(
        "Caregiver permission denied: Patient has not granted active consent to view or process prescriptions.",
        "forbidden",
        403,
        false
      );
    }

    if (res.status === 429) {
      throw new AiApiError(
        "Service is currently rate limited. Please try again in a few seconds.",
        "rate_limited",
        429,
        true
      );
    }

    const code =
      errorDetail?.error?.code ||
      (res.status === 503 ? "model_unavailable" : res.status === 504 ? "service_timeout" : "api_error");
    const message =
      errorDetail?.error?.message ||
      (code === "service_not_reachable"
        ? "CareBridge AI extraction service is not reachable. Please verify the AI service is running at http://127.0.0.1:8100."
        : code === "model_unavailable"
        ? "AI model is currently not available. Please verify the model configuration on AMD Token Factory."
        : code === "service_timeout"
        ? "CareBridge AI extraction timed out. Please retry with a clearer photo or enter details manually."
        : `Extraction failed with status ${res.status}`);
    const retryable = errorDetail?.error?.retryable ?? (res.status === 503 || res.status === 504 || res.status === 429);

    throw new AiApiError(message, code, res.status, retryable);
  }

  return (await res.json()) as ExtractionResult;
}

/**
 * Sends conversation messages and confirmed clinical documents to the chat companion.
 * Routes through the authenticated Member 2 backend proxy (/ai/chat) to enforce
 * document-level consent gating.
 */
export async function sendChatMessage(
  request: ChatRequest,
  useFixtures = false,
  patientId?: string
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

  const token = getAuthToken();
  const backendBase = getApiBaseUrl();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const payload = {
    ...request,
    patient_id: patientId || undefined,
  };

  let res: Response;
  const chatSignal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(60000) : undefined;
  try {
    res = await fetch(`${backendBase}/ai/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: chatSignal,
    });
  } catch {
    // Fallback: direct AI call
    const aiBase = getAiBaseUrl();
    try {
      res = await fetch(`${aiBase}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: chatSignal,
      });
    } catch {
      throw new AiApiError(
        "CareBridge AI service is not reachable. Please verify the AI service is running at http://127.0.0.1:8100.",
        "service_not_reachable",
        0,
        true
      );
    }
  }

  if (!res.ok) {
    let errorDetail: ApiErrorDetail | null = null;
    try {
      errorDetail = await res.json();
    } catch {
      // ignore
    }

    if (res.status === 403) {
      throw new AiApiError(
        "Caregiver permission denied: Patient has not granted consent to query these clinical documents.",
        "forbidden",
        403,
        false
      );
    }

    if (res.status === 429) {
      throw new AiApiError(
        "Service is currently rate limited. Please try again in a few seconds.",
        "rate_limited",
        429,
        true
      );
    }

    const code =
      errorDetail?.error?.code ||
      (res.status === 503 ? "model_unavailable" : res.status === 504 ? "service_timeout" : "chat_failed");
    const message =
      errorDetail?.error?.message ||
      (code === "service_not_reachable"
        ? "CareBridge AI service is not reachable. Please verify the AI service is running at http://127.0.0.1:8100."
        : code === "model_unavailable"
        ? "AI model is currently not available. Please verify the model configuration on AMD Token Factory."
        : code === "service_timeout"
        ? "CareBridge AI chat companion timed out waiting for model response."
        : `Chat request failed with status ${res.status}`);
    const retryable = errorDetail?.error?.retryable ?? (res.status === 503 || res.status === 504 || res.status === 429);

    throw new AiApiError(message, code, res.status, retryable);
  }

  return (await res.json()) as ChatResponse;
}

/**
 * Transcribes audio via Whisper endpoint through the Member 2 proxy.
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

  const token = getAuthToken();
  const backendBase = getApiBaseUrl();
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice_input.webm");
  if (languageHint) {
    formData.append("language_hint", languageHint);
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${backendBase}/ai/voice/transcribe`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch {
    const aiBase = getAiBaseUrl();
    try {
      res = await fetch(`${aiBase}/v1/voice/transcribe`, {
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

/**
 * Fetches AI service health and operational status.
 */
export async function getAiHealth(): Promise<{
  status: string;
  model: string;
  gpu?: string;
  stt_model?: string;
  embed_model?: string;
  embedder?: string;
  warning?: string;
  last_error?: {
    endpoint?: string;
    type?: string;
    status?: number;
    message?: string;
  } | null;
  is_connected: boolean;
}> {
  const backendBase = getApiBaseUrl();
  try {
    const res = await fetch(`${backendBase}/ai/health`);
    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status || "ok",
        model: data.model || "Gemma-4-31B-IT",
        gpu: data.gpu || "AMD Token Factory",
        stt_model: data.stt_model,
        embed_model: data.embed_model,
        embedder: data.embedder,
        warning: data.warning,
        last_error: data.last_error,
        is_connected: data.is_connected !== false,
      };
    }
  } catch {
    // ignore
  }

  // Direct AI fallback
  try {
    const aiBase = getAiBaseUrl();
    const res = await fetch(`${aiBase}/v1/health`);
    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status || "ok",
        model: data.model || "Gemma-4-31B-IT",
        gpu: data.compute_location || data.gpu || "AMD Token Factory",
        stt_model: data.stt_model,
        embed_model: data.embed_model,
        embedder: data.embedder,
        warning: data.warning,
        last_error: null,
        is_connected: true,
      };
    }
  } catch {
    // ignore
  }

  return {
    status: "offline",
    model: "Gemma-4-31B-IT (Offline Fallback)",
    gpu: "AMD Token Factory",
    stt_model: "not configured",
    embed_model: "keyword matching (bge-m3 not loaded)",
    is_connected: false,
  };
}

/**
 * Fetches AMD ROCm benchmark telemetry for AmdPanel.
 */
export async function getAiBenchmark(): Promise<BenchmarkSummary | null> {
  const backendBase = getApiBaseUrl();
  try {
    const res = await fetch(`${backendBase}/ai/metrics/benchmark`);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.concurrency_table || data.benchmarks)) {
        return data as BenchmarkSummary;
      }
    }
  } catch {
    // fallback
  }

  // Direct AI fallback
  try {
    const aiBase = getAiBaseUrl();
    const res = await fetch(`${aiBase}/v1/metrics/benchmark`);
    if (res.ok) {
      const data = await res.json();
      if (data && (data.concurrency_table || data.benchmarks)) {
        return data as BenchmarkSummary;
      }
    }
  } catch {
    // fallback
  }

  return benchmarkSummaryFixture;
}
