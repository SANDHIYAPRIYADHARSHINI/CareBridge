# AGENTS.md — CareBridge AI (read this first, every session)

## What we are building
CareBridge AI: a patient-care app for the **AMD Developer Hackathon ACT III (lablab.ai), Track 2: Health and Wellbeing**.
Online build window: 12–18 Oct 2026. Judges score: Application of Technology, Presentation, Business Value, Originality.
Hard rule of the hackathon: a meaningful part of the working product MUST run on AMD (ROCm GPU / AMD Developer Cloud / AMD Token Factory).

## Who you are helping
Eka = **Member 1**, owner of `services/ai/` (OCR + prescription extraction, chatbot, voice, summaries, safety, AMD deployment, benchmarks).
Member 2 owns `apps/web/` (React + TS), the main backend (auth, caregiver consent, reminders, appointments, hospital map) and PostgreSQL.
Do NOT edit Member 2's folders unless the task says so. Shared contract lives in `docs/api-contract.md`; change it only when asked, and note every change in `docs/CHANGELOG-CONTRACT.md`.

## Read before coding
1. `docs/product.md` — what and why
2. `docs/requirements.md` — MUST/SHOULD/COULD with acceptance criteria
3. `docs/architecture.md` + `docs/api-contract.md` — structure and JSON shapes
4. `docs/safety.md` — non-negotiable safety behavior
5. `docs/design.md` — only when touching UI
6. `docs/llm-prompts.md` — the prompts, use them verbatim as the starting point

## Stack (Member 1)
Python 3.11, FastAPI, Pydantic v2, uvicorn, httpx, pytest, ruff.
LLM/VLM: OpenAI-compatible endpoint (`LLM_BASE_URL`) served by **vLLM on ROCm** (AMD Developer Cloud) running a Gemma vision-capable model; same client also works against AMD Token Factory. Never hardcode a provider.
STT: Whisper (transformers, PyTorch ROCm). Embeddings: multilingual (bge-m3 class). OCR: Tesseract (eng+tam) for text lines + boxes.
No vector DB: in-memory numpy cosine search is enough.

## Golden rules
1. **Safety first** (see `docs/safety.md`): never diagnose, prescribe, change doses, or tell a patient to stop/start a medicine. Escalate instead.
2. **Never guess.** A missing/illegible field is `status: "missing" | "unclear"`, never invented. Every extracted field carries `evidence_line_ids` pointing at OCR lines; no evidence = needs review.
3. **Grounding gate:** chat answers must cite documents; sentences without support are removed or the whole answer becomes a refusal-with-reason.
4. **AI service is stateless.** It never reads the database. Member 2 passes only the documents the caller is authorized to see. Do not add DB access.
5. **Synthetic data only.** No real patient data anywhere, including tests, screenshots, and the demo.
6. **No secrets in git.** Everything through env vars, `.env.example` lists names only.
7. **Everything measurable:** every endpoint returns `metrics.latency_ms` and `metrics.model`; benchmarks are scripts in `services/ai/eval/`, results saved to `eval/results/*.json`.
8. **Mock mode:** `MOCK_MODE=true` makes every endpoint return fixtures from `services/ai/fixtures/` so Member 2 can integrate without a GPU. Keep fixtures identical in shape to real output.
9. Type hints everywhere, small functions, no dead code, tests for `verification.py`, `safety.py`, `translate.py` checks (these are pure and cheap to test).
10. Tamil is a first-class language: UTF-8 everywhere, Noto Sans Tamil in any rendered output, no ASCII-only regexes on user text.

## Do NOT
- Add features not in `requirements.md` MUST/SHOULD without asking.
- Use localStorage for anything sensitive; log patient text (log ids and lengths only).
- Add dependencies casually; justify each in the PR/plan note.
- Present simulated hospital data as real (Member 2's side, but flag it if you see it).
- Use CUDA-only packages. Everything must run on ROCm or CPU.

## How to work (Antigravity)
- For any task bigger than ~30 lines: produce an **implementation plan artifact first**, wait for approval, then execute.
- Work in small vertical slices: endpoint → test → fixture → curl example in `docs/api-contract.md`.
- After each slice run: `ruff check . && pytest -q` inside `services/ai`.
- Use the browser agent only for UI slices; verify against `docs/design.md`.
- Finish every task with: what changed, how to run it, what is still unverified.

## Definition of done (per feature)
Works against real model on AMD + works in mock mode, has a test or eval number, documented in contract, safe failure path shown (what happens when the model is wrong/uncertain).

## Commands
```
cd services/ai
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
MOCK_MODE=true uvicorn app.main:app --reload --port 8100
pytest -q
python eval/generate_synthetic.py && python eval/run_extraction_eval.py
python eval/bench_latency.py --concurrency 1 4 8 16
```
