# vibe-prompts.md — paste these into Antigravity in order

Setup: open the repo folder in Antigravity, make sure `AGENTS.md` and `docs/` are present. Use Planning mode for each prompt: review the plan artifact, approve, then let it run. After each prompt run the tests yourself before the next one.
(Antigravity reads rules from its own rules folder and, in recent versions, `AGENTS.md`; if it does not pick it up, paste the "Golden rules" section into a workspace rule.)

## P0 — Skeleton
"Read AGENTS.md and all files in docs/. Create the `services/ai` FastAPI skeleton exactly as in docs/architecture.md: config via pydantic-settings, request-id middleware, `/v1/health`, empty routers, Pydantic schemas copied from docs/api-contract.md, `MOCK_MODE` support that returns JSON fixtures. Create the fixtures listed in architecture.md with realistic synthetic data (English prescription with 3 medicines, one flagged example, chat supported, chat refusal, chat emergency). Add Dockerfile, requirements.txt (no CUDA packages), .env.example, ruff and pytest config. Plan first."

## P1 — Synthetic data
"Create `services/ai/eval/generate_synthetic.py`. It renders 30 synthetic prescriptions as PNG with PIL (mix of English and Tamil, Noto fonts, hospital header, 2 to 4 medicines each, rotation/noise/blur variations) and writes ground-truth JSON in the ExtractionResult field shape. 10 must be deliberately corrupted (missing strength, smudged frequency, quantity conflicting with frequency × duration, duplicate drug) and the ground truth must record which fields are corrupted. Use only invented drug-dose combos from `data/reference/drugs.json` stub. No real people or hospitals."

## P2 — OCR + LLM client
"Implement `core/ocr.py` (Tesseract eng+tam, lines with ids and bboxes, deskew) and `core/llm.py` (OpenAI-compatible async client via httpx, vision input support, JSON-mode, one retry on invalid JSON, timing metrics, provider selected only by env vars). Add tests with the LLM mocked."

## P3 — Extraction + verification
"Implement `core/extraction.py`, `core/verification.py`, `core/frequency.py` per docs/requirements.md RX-3 to RX-8 and docs/llm-prompts.md. Evidence gate, frequency normalizer (OD, BD, TDS, QID, HS, SOS, 1-0-1 style, 'twice a day'), conflict rules, flags, overall_status, review_reasons. Wire `POST /v1/prescriptions/extract`. Table-driven unit tests for frequency and conflicts. Show me an example output for 3 synthetic prescriptions."

## P4 — Safety + chat
"Implement `core/safety.py` (red-flag router from `data/redflags.json`, escalation levels L0 to L3, grounding gate, templated refusals), `core/rag.py` (in-memory embeddings with bge-m3, chunking of structured fields and OCR lines, top-k with ids) and `POST /v1/chat` per docs/safety.md and api-contract.md. Create `redflags.json` with English and Tamil examples for every category (mark Tamil entries `needs_native_review: true`). Tests: 25 red-flag prompts, emergency recall must be 100%."

## P5 — Voice + translation
"Implement `core/stt.py` (Whisper via transformers on PyTorch ROCm, language hint, confidence proxy), `POST /v1/voice/transcribe` with `needs_confirmation`, and `core/translate.py` with `phrases_ta.json` lookup plus the number and drug-name preservation check. Unit-test the preservation check with passing and failing examples. Leave `/v1/voice/speak` as a stub returning 501."

## P6 — Summaries + metrics
"Implement `POST /v1/summaries` and `GET /v1/metrics/benchmark` reading `eval/results/summary.json`. Add `/v1/health` GPU info via rocm-smi if available."

## P7 — Evals and benchmarks
"Implement eval/run_extraction_eval.py, run_chat_eval.py, bench_latency.py as described in docs/amd-deployment.md. Save JSON under eval/results and generate summary.json plus a markdown table. Sample GPU stats from rocm-smi once per second during runs."

## P8 — UI components (coordinate with Member 2's shell)
"In `apps/web/src/features/ai/` build PrescriptionReview, ChatPanel, VoiceButton, AmdPanel following docs/design.md exactly (tokens, fonts, status language, skeleton loaders, motion with reduced-motion support, no items from the anti-slop list). Use the fixtures first, then the live API. Use the browser agent to screenshot each state and compare with design.md."

## P9 — Polish and release
"Write README with a 10-minute AMD run guide, docker compose, licence (MIT), architecture diagram, results table from summary.json, and a Safety section mapped to the five Track 2 safety questions. Audit the repo for secrets and PHI. List anything unverified."
