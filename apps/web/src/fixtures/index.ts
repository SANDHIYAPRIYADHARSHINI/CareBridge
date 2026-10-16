import type { BenchmarkSummary, ChatResponse, ExtractionResult } from "../types/ai";
import { EMERGENCY_CONFIG } from "../config/emergency";

import rxDemo001Data from "./rx_demo_001.json";
import rxDemo002Data from "./rx_demo_002.json";
import rxDemo003Data from "./rx_demo_003.json";
import rxDemo004Data from "./rx_demo_004.json";
import rxDemo005Data from "./rx_demo_005.json";

// Synthetic demo fixtures corresponding to real sample images in public/
export const rxDemo001Fixture: ExtractionResult = {
  ...(rxDemo001Data as unknown as ExtractionResult),
  image: { width: 1200, height: 1600 },
};

export const rxDemo002Fixture: ExtractionResult = {
  ...(rxDemo002Data as unknown as ExtractionResult),
  image: { width: 1200, height: 1600 },
};

export const rxDemo003Fixture: ExtractionResult = {
  ...(rxDemo003Data as unknown as ExtractionResult),
  image: { width: 1200, height: 1600 },
};

export const rxDemo004Fixture: ExtractionResult = {
  ...(rxDemo004Data as unknown as ExtractionResult),
  image: { width: 1200, height: 1600 },
};

export const rxDemo005Fixture: ExtractionResult = {
  ...(rxDemo005Data as unknown as ExtractionResult),
  image: { width: 1200, height: 1600 },
};

export const demoFixturesByFilename: Record<string, ExtractionResult> = {
  "rx_demo_001.png": rxDemo001Fixture,
  "rx_demo_002.png": rxDemo002Fixture,
  "rx_demo_003.png": rxDemo003Fixture,
  "rx_demo_004.png": rxDemo004Fixture,
  "rx_demo_005.png": rxDemo005Fixture,
};

/**
 * Returns the exact ground-truth fixture matching the sample image filename or path.
 */
export function getFixtureForImage(nameOrPath: string): ExtractionResult {
  const clean = nameOrPath.split("/").pop()?.toLowerCase() || "";
  if (clean.includes("002")) return rxDemo002Fixture;
  if (clean.includes("003")) return rxDemo003Fixture;
  if (clean.includes("004")) return rxDemo004Fixture;
  if (clean.includes("005")) return rxDemo005Fixture;
  return rxDemo001Fixture;
}

// Default export mappings for existing references
export const extractionOkFixture: ExtractionResult = rxDemo001Fixture;
export const extractionFlaggedFixture: ExtractionResult = rxDemo001Fixture;

export const chatSupportedFixture: ChatResponse = {
  request_id: "req-mock-chat-001",
  language: "en",
  answer: "Your prescription lists Metformin 500mg, prescribed to be taken twice daily after food [c1]. It also lists Atorvastatin 10mg once daily at night [c2].",
  citations: [
    {
      id: "c1",
      doc_id: "doc-demo-rx-001",
      ref_id: null,
      line_ids: ["L5"],
      quote: "1. Tab Metformin 500mg - 1-0-1 after food x 30 days",
    },
    {
      id: "c2",
      doc_id: "doc-demo-rx-001",
      ref_id: null,
      line_ids: ["L7"],
      quote: "2. Tab Atorvastatin 10mg - 0-0-1 night after food x 30 days",
    },
  ],
  support_status: "supported",
  escalation: {
    required: false,
    level: "L0",
    reason: null,
    suggested_contact: "none",
  },
  uncertainty_notes: [],
  suggested_actions: [],
  metrics: { latency_ms: 185.4, model: "google/gemma-3-27b-it", gpu: "AMD Instinct MI300X" },
};

export const chatRefusalL2Fixture: ChatResponse = {
  request_id: "req-mock-chat-002",
  language: "en",
  answer: "I cannot advise you on changing or stopping your medication dose. Your record lists Metformin 500mg [c1]. Please consult your prescribing doctor or pharmacist before making any changes.",
  citations: [
    {
      id: "c1",
      doc_id: "doc-demo-rx-001",
      ref_id: null,
      line_ids: ["L5"],
      quote: "1. Tab Metformin 500mg - 1-0-1 after food x 30 days",
    },
  ],
  support_status: "partial",
  escalation: {
    required: true,
    level: "L2",
    reason: "Medication modification or discontinuation request requires physician review.",
    suggested_contact: "doctor",
  },
  uncertainty_notes: ["Clinical decisions require doctor or pharmacist consultation."],
  suggested_actions: [
    {
      type: "add_to_appointment_notes",
      payload: { topic: "Dose alteration inquiry", question: "Patient asked if they can reduce Metformin dose." },
    },
    {
      type: "contact_pharmacist",
      payload: { message: "Consult your community pharmacist regarding medication timing." },
    },
  ],
  metrics: { latency_ms: 140.2, model: "carebridge:clinical_safety", gpu: "none" },
};

export const chatEmergencyL3Fixture: ChatResponse = {
  request_id: "req-mock-chat-003",
  language: "en",
  answer: `This sounds like a life-threatening medical emergency. Please call emergency services immediately (${EMERGENCY_CONFIG.ambulance.number}) or go to the nearest emergency room. Do not attempt to drive yourself.`,
  citations: [],
  support_status: "unsupported",
  escalation: {
    required: true,
    level: "L3",
    reason: "Red-flag safety trigger [Acute Emergency Symptoms]: detected 'chest pain'.",
    suggested_contact: "emergency",
  },
  uncertainty_notes: ["LLM skipped due to red-flag safety trigger L3."],
  suggested_actions: [
    {
      type: "call_emergency",
      payload: {
        number: EMERGENCY_CONFIG.ambulance.number,
        description: EMERGENCY_CONFIG.ambulance.description,
        status: EMERGENCY_CONFIG.ambulance.status,
      },
    },
  ],
  metrics: { latency_ms: 12.0, model: "rule_engine:redflag_router", gpu: "none" },
};

export const benchmarkSummaryFixture: BenchmarkSummary = {
  status: "sample",
  is_sample: true,
  model: "google/gemma-3-27b-it",
  gpu: "AMD Instinct MI300X (ROCm 6.2)",
  generated_at: "Sample Preview (Unmeasured)",
  benchmarks: {
    concurrency_table: [
      { concurrency: 1, p50_ms: 280.4, p95_ms: 340.2, tokens_per_sec: 78.5 },
      { concurrency: 4, p50_ms: 310.2, p95_ms: 390.8, tokens_per_sec: 294.0 },
      { concurrency: 8, p50_ms: 365.1, p95_ms: 470.5, tokens_per_sec: 540.2 },
      { concurrency: 16, p50_ms: 450.0, p95_ms: 610.1, tokens_per_sec: 890.6 },
    ],
    extraction_accuracy: 0.962,
    flag_recall: 0.985,
    unsupported_rate: 0.041,
    escalation_recall: 1.0,
    red_flag_emergency_recall: 1.0,
  },
};
