# api-contract.md — AI service v1 (freeze by end of Oct 15)

Base: `http://ai:8100`. JSON unless noted. All responses include `request_id`. Errors:
```json
{ "error": { "code": "model_unavailable|invalid_input|too_large|unreadable|rate_limited", "message": "…", "retryable": true } }
```
Member 2 calls these server-to-server. Browsers never call the AI service directly.

## Shared types
```ts
type Status = "found" | "missing" | "unclear" | "conflict";
interface Field { value: string|null; raw: string|null; status: Status; confidence: number; evidence_line_ids: string[]; }
interface OcrLine { id: string; text: string; bbox: [number,number,number,number]; page: number; conf: number; } // bbox = x,y,w,h in image px
interface Flag { id: string; severity: "info"|"warn"|"block"; code: string; message: string; field_path: string|null; evidence_line_ids: string[]; }
interface Metrics { latency_ms: number; model: string; tokens_in?: number; tokens_out?: number; gpu?: string; }
interface Escalation { required: boolean; level: "L0"|"L1"|"L2"|"L3"; reason: string|null; suggested_contact: "none"|"pharmacist"|"doctor"|"emergency"|"crisis_line"; }
```

## GET /v1/health
`{ "status":"ok", "mock":false, "model":"…", "gpu":"AMD Instinct …", "stt_model":"…", "embed_model":"…" }`

## POST /v1/prescriptions/extract  (multipart/form-data)
Fields: `file` (jpg|png|pdf), `language_hint` (en|ta|auto, optional)
```ts
interface Medicine {
  id: string; name: Field; strength: Field; form: Field; dose: Field;
  frequency: Field; timing: Field; duration: Field; instructions: Field;
  frequency_normalized: { times_per_day: number|null; slots: ("morning"|"noon"|"evening"|"night")[]; as_needed: boolean } | null;
  suggestions: { field: string; suggested_value: string; reason: string }[];   // never auto-applied
  status: "verified_by_rules" | "needs_review";
}
interface ExtractionResult {
  request_id: string; document_id: string;                 // document_id minted by AI service, Member 2 may replace
  source: { type: "image"|"pdf"|"qr"; page_count: number };
  ocr: { engine: string; lines: OcrLine[] };
  prescriber: { name: Field; registration_no: Field; hospital: Field; date: Field };
  patient: { name: Field; age: Field };
  medicines: Medicine[];
  follow_up: Field;
  flags: Flag[];
  overall_status: "ready" | "needs_review" | "unreadable";
  review_reasons: string[];
  metrics: Metrics;
}
```
Rule: `ready` means no `warn`/`block` flags. The UI must still require the patient to confirm before reminders are created.

## POST /v1/prescriptions/from-qr  (SHOULD)
Body `{ "payload": "<decoded QR string>" }` or multipart image of the QR. Returns `ExtractionResult` with `source.type="qr"`, no OCR lines.

## POST /v1/chat
```ts
interface ChatRequest {
  messages: { role: "user"|"assistant"; content: string }[];   // last is the user question
  language: "en"|"ta"|"auto";
  documents: { doc_id: string; type: "prescription"|"discharge"|"report"; title: string; structured?: object; ocr_lines?: OcrLine[]; text?: string }[];
  use_reference: boolean;
}
interface Citation { id: string; doc_id: string|null; ref_id: string|null; line_ids: string[]; quote: string; }
interface ChatResponse {
  request_id: string; language: "en"|"ta";
  answer: string;                                 // plain text, with [c1] markers matching citations
  citations: Citation[];
  support_status: "supported"|"partial"|"unsupported";
  escalation: Escalation;
  uncertainty_notes: string[];
  suggested_actions: { type: "add_to_appointment_notes"|"call_emergency"|"contact_pharmacist"|"retake_photo"; payload: object }[];
  translation_check?: { numbers_preserved: boolean; drug_names_preserved: boolean; status: "ok"|"uncertain_translation" };
  metrics: Metrics;
}
```
POST /v1/chat/stream (SHOULD): SSE events `token`, then a final `done` with the full `ChatResponse`. The red-flag L3 case sends `done` immediately.

## POST /v1/voice/transcribe  (multipart: `audio` webm|wav|m4a, `language_hint`)
```json
{ "request_id":"…", "text":"…", "language":"ta", "confidence":0.0, "needs_confirmation":false, "metrics":{ } }
```
## POST /v1/voice/speak  (COULD) `{ "text":"…", "language":"ta" }` → `audio/wav`

## POST /v1/summaries
```ts
{ document: { doc_id: string; type: string; structured?: object; ocr_lines?: OcrLine[]; text?: string }, language: "en"|"ta" }
→ { summary_sentences: { text: string; citation_ids: string[] }[]; missing: string[]; inconsistencies: string[]; citations: Citation[];
    reading_level?: number; translation_check?: object; metrics: Metrics }
```

## POST /v1/translate
`{ "text": "…", "source": "en", "target": "ta", "protect": ["drug names", "numbers"] }` → `{ text, translation_check, method: "phrase_table"|"llm"|"mixed" }`

## GET /v1/metrics/benchmark
Latest `eval/results/summary.json`: model, gpu, concurrency table, p50/p95, tokens/s, extraction accuracy, flag recall, unsupported rate, escalation recall, `generated_at`. Powers the AmdPanel.

## Fixtures
`MOCK_MODE=true` returns files in `services/ai/fixtures/` with identical shape. First task for Member 1: commit these fixtures TODAY so Member 2 can build UI against them.

## curl examples (fill in as endpoints land)
```
curl -F file=@eval/data/rx_001.png http://localhost:8100/v1/prescriptions/extract
curl -X POST http://localhost:8100/v1/chat -H 'content-type: application/json' -d @fixtures/chat_request.json
```
