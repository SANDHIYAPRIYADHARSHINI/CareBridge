export type Status = "found" | "missing" | "unclear" | "conflict";

export interface Field {
  value: string | null;
  raw: string | null;
  status: Status;
  confidence: number;
  evidence_line_ids: string[];
}

export interface OcrLine {
  id: string;
  text: string;
  bbox: [number, number, number, number]; // [x, y, w, h] in px
  page: number;
  conf: number;
}

export interface Flag {
  id: string;
  severity: "info" | "warn" | "block";
  code: string;
  message: string;
  field_path: string | null;
  evidence_line_ids: string[];
}

export interface Metrics {
  latency_ms: number;
  model: string;
  tokens_in?: number;
  tokens_out?: number;
  gpu?: string;
}

export interface Escalation {
  required: boolean;
  level: "L0" | "L1" | "L2" | "L3";
  reason: string | null;
  suggested_contact: "none" | "pharmacist" | "doctor" | "emergency" | "crisis_line";
}

export interface Medicine {
  id: string;
  name: Field;
  strength: Field;
  form: Field;
  dose: Field;
  frequency: Field;
  timing: Field;
  duration: Field;
  instructions: Field;
  frequency_normalized?: {
    times_per_day: number | null;
    slots: ("morning" | "noon" | "evening" | "night")[];
    as_needed: boolean;
  } | null;
  suggestions?: {
    field: string;
    suggested_value: string;
    reason: string;
  }[];
  status: "verified_by_rules" | "needs_review";
}

export interface ExtractionResult {
  request_id: string;
  document_id: string;
  source: {
    type: "image" | "pdf" | "qr";
    page_count: number;
  };
  image?: {
    width: number;
    height: number;
  };
  ocr: {
    engine: string;
    lines: OcrLine[];
  };
  prescriber: {
    name: Field;
    registration_no: Field;
    hospital: Field;
    date: Field;
  };
  patient: {
    name: Field;
    age: Field;
  };
  medicines: Medicine[];
  follow_up: Field;
  flags: Flag[];
  overall_status: "ready" | "needs_review" | "unreadable";
  review_reasons: string[];
  metrics: Metrics;
}

export interface Citation {
  id: string;
  doc_id: string | null;
  ref_id: string | null;
  line_ids: string[];
  quote: string;
}

export interface SuggestedAction {
  type: "add_to_appointment_notes" | "call_emergency" | "contact_pharmacist" | "retake_photo";
  payload: Record<string, any>;
}

export interface ChatResponse {
  request_id: string;
  language: string;
  answer: string;
  citations: Citation[];
  support_status: "supported" | "partial" | "unsupported";
  escalation: Escalation;
  uncertainty_notes: string[];
  suggested_actions: SuggestedAction[];
  translation_check?: {
    numbers_preserved: boolean;
    drug_names_preserved: boolean;
    status: "ok" | "uncertain_translation";
  };
  metrics: Metrics;
}

export interface ConcurrencyPoint {
  concurrency: number;
  p50_ms: number;
  p95_ms: number;
  tokens_per_sec: number;
}

export interface BenchmarkSummary {
  status?: string;
  is_sample?: boolean;
  message?: string;
  model: string;
  gpu: string;
  generated_at?: string;
  benchmarks?: {
    concurrency_table: ConcurrencyPoint[];
    extraction_accuracy: number;
    flag_recall: number;
    unsupported_rate: number;
    escalation_recall: number;
    red_flag_emergency_recall: number;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatDocument {
  doc_id: string;
  type: "prescription" | "discharge" | "report";
  title: string;
  structured?: Record<string, any>;
  ocr_lines?: OcrLine[];
  text?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  language?: string;
  documents?: ChatDocument[];
  use_reference?: boolean;
}

export interface TranscribeResponse {
  request_id: string;
  text: string;
  language: string;
  confidence: number;
  needs_confirmation: boolean;
  metrics: Metrics;
}

export interface ApiErrorDetail {
  error: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}


