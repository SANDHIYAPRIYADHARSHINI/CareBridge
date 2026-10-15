# architecture.md

## System view
```
Browser (React+TS, Member 2)
   |  REST/SSE (JWT)
Main API (FastAPI, Member 2)  ---- PostgreSQL (users, consent, docs, reminders, slots)
   |  internal HTTP, passes ONLY authorized docs
AI Service (FastAPI, Member 1)  services/ai
   |-- OCR: Tesseract (eng+tam) -> lines + boxes            [CPU]
   |-- LLM/VLM client -> vLLM on ROCm (Gemma, vision)       [AMD GPU]
   |-- STT: Whisper (PyTorch ROCm)                          [AMD GPU]
   |-- Embeddings: multilingual (bge-m3 class)              [AMD GPU]
   |-- verification.py  (evidence gate, conflicts, frequency normalizer)
   |-- safety.py        (red-flag router, grounding gate, escalation levels)
   |-- translate.py     (phrase table + number/drug-name preservation check)
```
The AI service is stateless. Permissions are enforced by Member 2 before any call. The AI service trusts nothing inside document text.

## Folder layout (services/ai)
```
services/ai/
  app/
    main.py                # FastAPI app, CORS, request-id middleware
    config.py              # pydantic-settings, env only
    routers/ health.py prescriptions.py chat.py voice.py summaries.py translate.py metrics.py
    core/ llm.py ocr.py extraction.py verification.py frequency.py rag.py
          safety.py stt.py tts.py translate.py metrics.py
    schemas/ common.py prescription.py chat.py voice.py summary.py
    prompts/ extraction.md chat.md verifier.md summary.md   # copy from docs/llm-prompts.md
  data/ reference/drugs.json  phrases_ta.json  redflags.json
  fixtures/ extraction_ok.json extraction_flagged.json chat_supported.json chat_refusal.json chat_emergency.json
  eval/ generate_synthetic.py run_extraction_eval.py run_chat_eval.py bench_latency.py results/
  tests/
  Dockerfile  requirements.txt  .env.example
infra/ docker-compose.yml  vllm/serve.sh
```

## Request pipelines

### Prescription extract
1. Validate file (type, size, pages). PDF → page images (pdf2image/pypdfium2).
2. Preprocess (deskew, grayscale, upscale if small).
3. Tesseract → `lines[]` with ids `L1..Ln`, bbox, conf.
4. VLM call with: image + numbered OCR lines + JSON schema → fields with `evidence_line_ids`.
5. `verification.py`:
   - evidence gate: value fuzzy-supported by cited lines? else `unclear`
   - low OCR conf on cited lines → lower confidence, maybe `unclear`
   - frequency normalizer + conflict rules
   - optional reference-list "did you mean"
6. (SHOULD) second pass on strength/frequency/duration; disagreement → `conflict`.
7. Build `flags[]`, `overall_status`, `review_reasons[]`, `metrics`.

### Chat
1. Red-flag router on the user text (rules first, then a small LLM classifier for the ambiguous ones). Emergency → return L3 immediately, skip the LLM.
2. Retrieve top-k chunks from caller-provided docs (structured fields + OCR text) and the local reference set.
3. Generate with the chat prompt; output JSON `{answer_sentences:[{text, citation_ids}], needs_clinician, reason}`.
4. Grounding gate: drop uncited sentences; if nothing left or the question needs judgment → templated refusal.
5. Verifier prompt checks each cited sentence against its quote (SHOULD).
6. Translate if needed via `translate.py` (phrase table + preservation check).
7. Return answer, citations, support status, escalation, metrics.

### Voice
Audio → Whisper (language hint) → transcript + confidence proxy (avg logprob / no_speech_prob) → if low: ask to confirm → else chat pipeline → text answer (+ optional server TTS). Browser TTS is the baseline.

## Data shapes
See `api-contract.md`. Field object used everywhere:
```
Field { value: string|null, raw: string|null, status: "found"|"missing"|"unclear"|"conflict",
        confidence: 0..1, evidence_line_ids: string[] }
```

## Config (env)
```
MOCK_MODE=false
LLM_BASE_URL=http://localhost:8000/v1      # vLLM on AMD, or Token Factory
LLM_API_KEY=local
LLM_MODEL=google/gemma-3-27b-it            # use the Gemma vision model that vLLM-ROCm supports
WHISPER_MODEL=openai/whisper-large-v3-turbo
EMBED_MODEL=BAAI/bge-m3
OCR_LANGS=eng+tam
MAX_UPLOAD_MB=10
ALLOWED_ORIGINS=http://localhost:5173
```

## Failure behavior (design for the demo)
- LLM down → `503` with `code: "model_unavailable"`; Member 2 shows manual-entry fallback.
- Invalid JSON twice → return OCR lines + `overall_status: "needs_review"` instead of an error.
- Unreadable image → `overall_status: "unreadable"` with retake tips.
- Never silently fall back to a different model without `metrics.model` showing it.
