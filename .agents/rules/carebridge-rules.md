# CareBridge AI — Workspace Rules (Golden Rules)

## Context
CareBridge AI: patient-care application for the AMD Developer Hackathon ACT III (lablab.ai), Track 2: Health and Wellbeing.
We are Member 1 (Eka), owning `services/ai/`.
Member 2 owns `apps/web/`, backend, and PostgreSQL. Shared contract is `docs/api-contract.md`.

## Golden Rules
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
- Present simulated hospital data as real.
- Use CUDA-only packages. Everything must run on ROCm or CPU.

## Planning & Workflow
- Produce an implementation plan artifact first for any non-trivial change, wait for user review/approval, then execute.
- Work in vertical slices: endpoint -> test -> fixture -> curl example in `docs/api-contract.md`.
- Run linter and tests after each slice.
