# Member 1 & Member 2 API Integration Guide

This document specifies the integration architecture, shared data structures, server-to-server proxy contracts, caregiver permission gating, and error handling protocols between Member 1's AI Microservice (`services/ai`, port 8100) and Member 2's Application Backend (`services/backend`, port 8080) and Web Frontend (`apps/web`).

---

## 1. Architectural Architecture & Division of Responsibility

```
┌─────────────────────────────────┐
│     Member 2 React Web App      │
│  (UI, Redux/State, Dropzones)   │
└────────────────┬────────────────┘
                 │ HTTP (JWT Bearer Token)
                 ▼
┌─────────────────────────────────┐
│     Member 2 FastAPI Backend    │  <── Evaluates JWT & Caregiver Consent
│ (Auth, PostgreSQL, Audit Logs)  │  <── Rejects unapproved requests (403)
└────────────────┬────────────────┘  <── Strips unauthorized private documents
                 │ Server-to-Server (Internal Network)
                 ▼
┌─────────────────────────────────┐
│      Member 1 AI Microservice   │
│  (Stateless, ROCm/vLLM / CPU)   │  <── Runs OCR, Vision LLM, Whisper, RAG
└─────────────────────────────────┘
```

1. **Stateless AI Service (Member 1)**:
   - Does **not** connect to PostgreSQL or read user sessions.
   - Accepts strictly authorized documents and messages passed by Member 2.
   - Runs inference on AMD Instinct / ROCm / CPU with standardized latency telemetry.
2. **Stateful Application Backend (Member 2)**:
   - Manages Users, JWTs, Caregiver Consent records, Appointments, and Audit Logs.
   - Enforces granular permission verification (`can_view_prescriptions`, `can_view_records`, `can_view_reminders`, `can_view_appointments`).
   - Gating: Ensures only permitted documents reach Member 1's models.
   - Intercepts downtime/timeouts and maps them to clean retryable error schemas.

---

## 2. Shared Data Structures

### A. Prescriptions & Clinical Extraction
- **`Medicine`**:
  - `id`: unique medicine identifier (`str`).
  - `name`, `strength`, `form`, `dose`, `frequency`, `timing`, `duration`, `instructions`: each an `ExtractedField` containing `{ value: str|null, raw: str|null, status: "found"|"missing"|"unclear"|"conflict", confidence: float, evidence_line_ids: list[str] }`.
  - `frequency_normalized`: `{ times_per_day: int|null, slots: list["morning"|"noon"|"evening"|"night"], as_needed: bool }`.
  - `status`: `"verified_by_rules"` or `"needs_review"`.
- **`ExtractionResult`**:
  - `request_id`, `document_id`: unique identifiers.
  - `source`: `{ type: "image"|"pdf"|"qr", page_count: int }`.
  - `image`: natural image dimensions `{ width: int, height: int }` for responsive client-side bounding box overlay.
  - `ocr`: `{ engine: str, lines: list[OcrLine] }`.
  - `prescriber`: `{ name, registration_no, hospital, date }`.
  - `patient`: `{ name, age }`.
  - `medicines`: `list[Medicine]`.
  - `flags`: `list[Flag]` with severities `info`, `warn`, `block`.
  - `overall_status`: `"ready" | "needs_review" | "unreadable"`.
  - `metrics`: `{ latency_ms: float, model: str, gpu: str|None }`.

### B. Chat & Grounded Clinical QA
- **`ChatMessage`**: `{ role: "user" | "assistant", content: str }`.
- **`ChatDocument`**:
  - `doc_id`: document identifier.
  - `type`: `"prescription" | "discharge" | "report"`.
  - `title`: human-readable label.
  - `structured`: optional dictionary of extracted fields.
  - `ocr_lines`: optional OCR bounding boxes.
- **`Citation`**: `{ id: str, doc_id: str|null, line_ids: list[str], quote: str }`.
- **`Escalation`**: `{ required: bool, level: "L0"|"L1"|"L2"|"L3", reason: str|null, suggested_contact: str }`.
- **`ChatResponse`**:
  - `answer`: plain text with citation anchors (e.g. `[c1]`).
  - `citations`: list of cited fragments matching answer anchors.
  - `support_status`: `"supported" | "partial" | "unsupported"`.
  - `escalation`: safety triage level.
  - `metrics`: latency and inference device telemetry.

### C. Caregiver Consent & Granular Permissions
- **`CaregiverConsent`**:
  - `patient_id`, `caregiver_id`: user UUIDs.
  - `status`: `"pending" | "approved" | "rejected" | "revoked"`.
  - Permissions:
    - `can_view_prescriptions` (`bool`): authorizes extraction, medicine review, and prescription RAG.
    - `can_view_reminders` (`bool`): authorizes medication schedules and dose adherence.
    - `can_view_records` (`bool`): authorizes lab reports, discharge summaries, and record QA.
    - `can_view_appointments` (`bool`): authorizes booking, viewing, and cancelling consultations.

---

## 3. Agreed Endpoints & Permission Rules

| Endpoint | Method | Caller | Permission Required | Failure / Error Code |
| :--- | :--- | :--- | :--- | :--- |
| `/ai/health` | `GET` | Web / Public | None | Returns `{ status: "offline", is_connected: false }` on network failure. |
| `/ai/extract` | `POST` | Web Client | Patient (own account) OR Caregiver (`can_view_prescriptions == true`) | `400` if caregiver omits `patient_id`; `403` if unapproved; `503` if AI unavailable. |
| `/ai/chat` | `POST` | Web Client | Patient (own account) OR Caregiver (verified per document type) | `403` if document type unauthorized; `503` if model timeout. |
| `/ai/summaries` | `POST` | Web Client | Patient OR Caregiver (`can_view_prescriptions` / `can_view_records`) | `403` if document permission missing. |
| `/ai/voice/transcribe` | `POST` | Web Client | Authenticated User | `503` if Whisper service unreachable. |
| `/ai/translate` | `POST` | Web Client | Authenticated User | `503` on translation engine failure. |
| `/ai/metrics/benchmark` | `GET` | Web Client | None | Fallbacks to synthetic telemetry if offline. |

---

## 4. Failure Handling & Non-Technical Safety Responses

When Member 1's AI service is starting up, under load, or experiencing model downtime:
1. **Never leak raw Python stack traces** to the user.
2. Returns standard JSON error payload:
   ```json
   {
     "error": {
       "code": "model_unavailable",
       "message": "The CareBridge AI extraction service is temporarily unreachable. Please retry or enter medicines manually.",
       "retryable": true
     }
   }
   ```
3. Frontend presents calm, non-alarming status cards offering:
   - "Retry Extraction"
   - "Enter Medicines Manually"
   - "Use Synthetic Demo Sample"
