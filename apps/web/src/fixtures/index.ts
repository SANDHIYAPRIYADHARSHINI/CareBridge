import type { BenchmarkSummary, ChatResponse, ExtractionResult } from "../types/ai";
import { EMERGENCY_CONFIG } from "../config/emergency";

export const extractionOkFixture: ExtractionResult = {
  request_id: "req-mock-extract-ok-001",
  document_id: "doc-syn-rx-001",
  source: {
    type: "image",
    page_count: 1,
  },
  ocr: {
    engine: "tesseract-5.3.0",
    lines: [
      { id: "L1", text: "KAVERI COMMUNITY CLINIC, CHENNAI", bbox: [100, 50, 600, 30], page: 1, conf: 0.98 },
      { id: "L2", text: "Dr. S. Ramanathan, MD (Gen Med) Reg: TN-MC-48291", bbox: [100, 90, 550, 25], page: 1, conf: 0.96 },
      { id: "L3", text: "Patient: K. Sundaram  Age: 58 M  Date: 12-Oct-2026", bbox: [100, 130, 500, 25], page: 1, conf: 0.95 },
      { id: "L4", text: "1. Tab Metformin 500mg - 1-0-1 after food x 30 days", bbox: [100, 180, 580, 25], page: 1, conf: 0.94 },
      { id: "L5", text: "2. Tab Atorvastatin 10mg - 0-0-1 night after food x 30 days", bbox: [100, 220, 620, 25], page: 1, conf: 0.95 },
      { id: "L6", text: "3. Tab Amlodipine 5mg - 1-0-0 morning before food x 30 days", bbox: [100, 260, 610, 25], page: 1, conf: 0.93 },
      { id: "L7", text: "Follow up in 4 weeks with fasting blood sugar and lipid profile", bbox: [100, 320, 650, 25], page: 1, conf: 0.92 },
    ],
  },
  prescriber: {
    name: { value: "Dr. S. Ramanathan", raw: "Dr. S. Ramanathan, MD", status: "found", confidence: 0.96, evidence_line_ids: ["L2"] },
    registration_no: { value: "TN-MC-48291", raw: "TN-MC-48291", status: "found", confidence: 0.98, evidence_line_ids: ["L2"] },
    hospital: { value: "Kaveri Community Clinic, Chennai", raw: "KAVERI COMMUNITY CLINIC, CHENNAI", status: "found", confidence: 0.98, evidence_line_ids: ["L1"] },
    date: { value: "2026-10-12", raw: "12-Oct-2026", status: "found", confidence: 0.95, evidence_line_ids: ["L3"] },
  },
  patient: {
    name: { value: "K. Sundaram", raw: "K. Sundaram", status: "found", confidence: 0.95, evidence_line_ids: ["L3"] },
    age: { value: "58", raw: "58", status: "found", confidence: 0.97, evidence_line_ids: ["L3"] },
  },
  medicines: [
    {
      id: "med-1",
      name: { value: "Metformin", raw: "Metformin", status: "found", confidence: 0.97, evidence_line_ids: ["L4"] },
      strength: { value: "500 mg", raw: "500mg", status: "found", confidence: 0.96, evidence_line_ids: ["L4"] },
      form: { value: "tablet", raw: "Tab", status: "found", confidence: 0.98, evidence_line_ids: ["L4"] },
      dose: { value: "1 tablet", raw: "1", status: "found", confidence: 0.95, evidence_line_ids: ["L4"] },
      frequency: { value: "twice daily", raw: "1-0-1", status: "found", confidence: 0.94, evidence_line_ids: ["L4"] },
      timing: { value: "after food", raw: "after food", status: "found", confidence: 0.93, evidence_line_ids: ["L4"] },
      duration: { value: "30 days", raw: "30 days", status: "found", confidence: 0.95, evidence_line_ids: ["L4"] },
      instructions: { value: "take after food twice daily", raw: "after food", status: "found", confidence: 0.92, evidence_line_ids: ["L4"] },
      frequency_normalized: { times_per_day: 2, slots: ["morning", "night"], as_needed: false },
      status: "verified_by_rules",
    },
    {
      id: "med-2",
      name: { value: "Atorvastatin", raw: "Atorvastatin", status: "found", confidence: 0.96, evidence_line_ids: ["L5"] },
      strength: { value: "10 mg", raw: "10mg", status: "found", confidence: 0.95, evidence_line_ids: ["L5"] },
      form: { value: "tablet", raw: "Tab", status: "found", confidence: 0.98, evidence_line_ids: ["L5"] },
      dose: { value: "1 tablet", raw: "1", status: "found", confidence: 0.94, evidence_line_ids: ["L5"] },
      frequency: { value: "once daily night", raw: "0-0-1 night", status: "found", confidence: 0.95, evidence_line_ids: ["L5"] },
      timing: { value: "night after food", raw: "night after food", status: "found", confidence: 0.94, evidence_line_ids: ["L5"] },
      duration: { value: "30 days", raw: "30 days", status: "found", confidence: 0.95, evidence_line_ids: ["L5"] },
      instructions: { value: "take at bedtime after food", raw: "night after food", status: "found", confidence: 0.93, evidence_line_ids: ["L5"] },
      frequency_normalized: { times_per_day: 1, slots: ["night"], as_needed: false },
      status: "verified_by_rules",
    },
    {
      id: "med-3",
      name: { value: "Amlodipine", raw: "Amlodipine", status: "found", confidence: 0.95, evidence_line_ids: ["L6"] },
      strength: { value: "5 mg", raw: "5mg", status: "found", confidence: 0.95, evidence_line_ids: ["L6"] },
      form: { value: "tablet", raw: "Tab", status: "found", confidence: 0.98, evidence_line_ids: ["L6"] },
      dose: { value: "1 tablet", raw: "1", status: "found", confidence: 0.93, evidence_line_ids: ["L6"] },
      frequency: { value: "once daily morning", raw: "1-0-0 morning", status: "found", confidence: 0.94, evidence_line_ids: ["L6"] },
      timing: { value: "morning before food", raw: "morning before food", status: "found", confidence: 0.94, evidence_line_ids: ["L6"] },
      duration: { value: "30 days", raw: "30 days", status: "found", confidence: 0.95, evidence_line_ids: ["L6"] },
      instructions: { value: "take in morning before breakfast", raw: "morning before food", status: "found", confidence: 0.93, evidence_line_ids: ["L6"] },
      frequency_normalized: { times_per_day: 1, slots: ["morning"], as_needed: false },
      status: "verified_by_rules",
    },
  ],
  follow_up: { value: "in 4 weeks", raw: "in 4 weeks with fasting blood sugar and lipid profile", status: "found", confidence: 0.92, evidence_line_ids: ["L7"] },
  flags: [],
  overall_status: "ready",
  review_reasons: [],
  metrics: { latency_ms: 310.5, model: "google/gemma-3-27b-it", gpu: "AMD Instinct MI300X" },
};

export const extractionFlaggedFixture: ExtractionResult = {
  ...extractionOkFixture,
  request_id: "req-mock-extract-flagged-002",
  medicines: [
    ...extractionOkFixture.medicines.slice(0, 2),
    {
      ...extractionOkFixture.medicines[2],
      strength: {
        value: "5 mg",
        raw: "5mg?",
        status: "unclear",
        confidence: 0.58,
        evidence_line_ids: ["L6"],
      },
      status: "needs_review",
      suggestions: [
        { field: "strength", suggested_value: "5 mg", reason: "Standard clinical strength for Amlodipine" },
      ],
    },
  ],
  flags: [
    {
      id: "flag-1",
      severity: "warn",
      code: "FIELD_UNCLEAR",
      message: "Strength is hard to read on handwritten note. Please confirm with physical bottle.",
      field_path: "medicines[2].strength",
      evidence_line_ids: ["L6"],
    },
  ],
  overall_status: "needs_review",
  review_reasons: ["Strength is hard to read on handwritten line 3."],
};

export const chatSupportedFixture: ChatResponse = {
  request_id: "req-mock-chat-001",
  language: "en",
  answer: "According to your prescription, take Metformin 500mg twice daily after meals [c1], and Atorvastatin 10mg once at night [c2].",
  citations: [
    {
      id: "c1",
      doc_id: "doc-syn-rx-001",
      ref_id: null,
      line_ids: ["L4"],
      quote: "1. Tab Metformin 500mg - 1-0-1 after food x 30 days",
    },
    {
      id: "c2",
      doc_id: "doc-syn-rx-001",
      ref_id: null,
      line_ids: ["L5"],
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
  metrics: { latency_ms: 185.0, model: "google/gemma-3-27b-it", gpu: "AMD Instinct MI300X" },
};

export const chatRefusalL2Fixture: ChatResponse = {
  request_id: "req-mock-chat-002",
  language: "en",
  answer: "I cannot advise you on changing or stopping your medication dose. Your record lists Metformin 500mg [c1]. Please consult your prescribing doctor or pharmacist before making any changes.",
  citations: [
    {
      id: "c1",
      doc_id: "doc-syn-rx-001",
      ref_id: null,
      line_ids: ["L4"],
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

