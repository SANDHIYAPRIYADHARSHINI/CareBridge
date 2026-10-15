# plan.md — 3 days to submit (today is Thu 15 Oct; online build ends Sun 18 Oct)

Confirm the exact cutoff time and timezone on the lablab page/Discord today. The event is run from Italy, so assume cutoff in CEST and aim to submit the evening of **Sat 17 Oct (IST)**, leaving Sunday as buffer.

## What the hackathon wants (from the event page)
- Track 2 "Health and Wellbeing": make a part of the patient journey safer, clearer, easier. Show a realistic case from first input to final result. Make uncertainty visible. Know when a person must take over. Explain handling of: incorrect/unsupported responses, sensitive info, uncertain results, high-risk decisions, human review. No autonomous diagnosis/treatment advice.
- AMD is mandatory for prizes; a meaningful part of the working product must run on AMD.
- Optional partner prize: Google (use Gemma on AMD). Evolus track needs its own platform integration; skip it, too much for 3 days.
- Submit: title, short + long description, track, tags, working prototype, cover image, demo video, slide deck, public GitHub repo (MIT-compatible, containerized, README that runs, no keys), demo app URL.
- Judging: Application of Technology, Presentation, Business Value, Originality.
- Prize pool $17,000+; Vibe Generation special prize for the best solution (criteria: commercial thinking, execution/orchestration of AI tools, taste and originality).

## Cut list (scope discipline)
Cut or stub: real QR hospital systems (use signed JSON in QR, SHOULD only), server-side Tamil TTS (browser TTS baseline), handwriting fine-tuning, drug-interaction checking, real hospital data, push notifications.
Member 2 equivalent cuts: PostgreSQL slot logic stays simple, map uses 8–10 synthetic hospitals, one demo patient + one caregiver.

## Day 1 — Thu 15 Oct: unblock everything
- [ ] AMD AI Developer Program signup, lablab enroll, Discord, confirm Token Factory vs Developer Cloud route (30 min)
- [ ] Repo skeleton, `AGENTS.md` + docs committed, Antigravity opened on the repo (30 min)
- [ ] Send `api-contract.md` to Member 2 and agree it. Commit fixtures + `MOCK_MODE` endpoints (2 h). Member 2 can now build UI.
- [ ] Bring vLLM up on AMD (or Token Factory) and get one Gemma vision call returning (2–3 h; if stuck >90 min, switch to Token Factory and keep going)
- [ ] `generate_synthetic.py`: first 10 prescriptions + ground truth
- [ ] Extraction MVP: OCR → VLM → schema JSON for one prescription
End of day gate: one real extraction from a synthetic prescription through the API on AMD.

## Day 2 — Fri 16 Oct: the product
- [ ] Evidence gate, frequency normalizer, conflict rules, flags (unit tests)
- [ ] Remaining 20 synthetic docs, 10 corrupted; extraction eval v1 numbers
- [ ] Chat: retrieval, citations, grounding gate, red-flag router, templated refusals
- [ ] Whisper transcribe endpoint on GPU, confirm-transcript step
- [ ] `PrescriptionReview` + `ChatPanel` + `VoiceButton` components against live API
- [ ] Reference `drugs.json` (≤ 30 entries from public patient-info pages, with source URLs), `phrases_ta.json` + `redflags.json` reviewed by Eka
End of day gate: hero flow steps 1–7 work end to end on the AMD backend.

## Day 3 — Sat 17 Oct: prove it and package it
- [ ] Integrate with Member 2's shell (auth, reminders gate, caregiver view)
- [ ] Benchmarks: latency/throughput, chat eval, red-flag recall, optional model-size trade-off; `AmdPanel`
- [ ] Docker compose, README "run in 10 minutes", `.env.example`, licence file
- [ ] Deploy demo URL; warm the model; run the demo twice
- [ ] **Feature freeze at 6 pm.** Only fixes after that.
- [ ] Record the video (rehearse once), cover image, slides

## Day 4 — Sun 18 Oct: buffer and submission
- [ ] Re-read the submission checklist, fix README, verify repo is public and clean (`git log -p | grep -i key`)
- [ ] Submit early. Post in Discord. Keep GPU and demo URL alive.

## Demo video (3 min, tell one story)
0:00 Problem in one sentence + a real-looking prescription · 0:20 Upload, extraction streams in, highlight-to-source · 0:50 Amber flags: "we refused to guess" · 1:10 Confirm, reminders · 1:25 Tamil voice question, cited Tamil answer · 1:50 Clinical question → refusal and referral; "chest pain" → emergency screen · 2:10 Caregiver view (Member 2) · 2:25 AMD panel: model, GPU, p50/p95, tokens/s, accuracy numbers · 2:50 Business value (who pays) and close.

## Slide deck (8 slides)
1 Title and one-line promise · 2 Problem with sourced stats · 3 Solution: hero flow screenshot · 4 How it stays safe (the five Track-2 safety questions, one line each) · 5 Architecture with AMD highlighted · 6 Results table (real numbers, n stated) · 7 Business value and go-to-market (hospital pharmacies, discharge desks, adherence programs) · 8 Roadmap + team.

## Judging map
| Criterion | Our evidence |
|---|---|
| Application of Technology | Gemma VLM + Whisper + embeddings on AMD GPU via vLLM/ROCm, deterministic safety layers, benchmarks, live AMD panel, model-size trade-off |
| Presentation | Single story, real product on screen, 3-minute video, rehearsed live fallback |
| Business Value | Adherence, call-center load, discharge clarity; a named buyer; measured time saved on the synthetic set |
| Originality | Evidence-linked extraction, uncertainty-first design, Tamil instruction-preserving checks |

## Risks
| Risk | Mitigation |
|---|---|
| ROCm/vLLM setup eats day 1 | Token Factory fallback behind the same env vars; ask in Discord early |
| Gemma gated access delay | Request HF access now; have a second open vision model ready |
| Tamil OCR quality | Lean on the VLM + image; evidence gate downgrades instead of guessing; evaluate honestly |
| Member 2 integration late | Mock mode and fixtures today |
| Demo instance dies | Recorded video made on real hardware; second warm run; keep Token Factory fallback |
| Overclaiming | Report n and "synthetic" next to every metric |
