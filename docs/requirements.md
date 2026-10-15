# requirements.md — Member 1 scope (services/ai)

Priority: **M** = must ship by Oct 17 night, **S** = should, **C** = could (only if M and S are done and green). Anything not listed is cut.
Time reality: today is Oct 15, deadline Oct 18. Scope is deliberately smaller than the original brief.

## A. Prescription processing
| ID | P | Requirement | Acceptance |
|---|---|---|---|
| RX-1 | M | `POST /v1/prescriptions/extract` accepts JPG/PNG/PDF (≤10 MB, ≤3 pages) | Returns `ExtractionResult` (see contract) in < 15 s p95 for 1 page |
| RX-2 | M | OCR lines with ids and boxes (Tesseract eng+tam) | Each line `{id,text,bbox,page,conf}` |
| RX-3 | M | VLM/LLM extraction of medicine name, strength, form, dose, frequency, timing, duration, instructions, prescriber, date, follow-up | Schema-valid JSON, retried once on invalid output |
| RX-4 | M | Every field has `status`, `confidence`, `evidence_line_ids` | No field with `found` and empty evidence |
| RX-5 | M | Evidence gate: field `value` must be supported by cited OCR text (fuzzy match) or it is downgraded to `unclear` | Unit-tested |
| RX-6 | M | Flags for missing / illegible / conflicting | Corrupted-fixture recall ≥ 90% |
| RX-7 | M | Frequency normalizer (OD, BD, TDS, QID, HS, SOS, 1-0-1, 1-1-1, "twice a day" …) → structured `{times_per_day, slots}` | Table-driven tests |
| RX-8 | M | Conflict rules: frequency × duration vs quantity; duplicate drug; strength unusual vs reference list | Each rule has a test |
| RX-9 | S | Drug-name fuzzy match against a 30–50 item local reference list; suggest "did you mean" but never auto-replace | Shown as suggestion only |
| RX-10 | S | QR: decode QR (OpenCV) containing a JSON prescription payload from the synthetic hospital; skip OCR | `POST /v1/prescriptions/from-qr` |
| RX-11 | C | Multi-page PDFs beyond 3 pages, handwriting fine-tuning | — |

## B. Chatbot
| ID | P | Requirement | Acceptance |
|---|---|---|---|
| CH-1 | M | `POST /v1/chat` takes messages + authorized documents from caller | Never fetches data itself |
| CH-2 | M | Retrieval over caller-provided docs (+ small reference set) | top-k with doc/line ids |
| CH-3 | M | Answer with citations `[{doc_id,line_ids|ref_id,quote}]` | Every factual sentence has ≥1 citation |
| CH-4 | M | Support status `supported | partial | unsupported` | Unsupported → templated refusal with reason |
| CH-5 | M | Red-flag router before the LLM (emergency, self-harm, pregnancy/child dosing, stop/skip/double dose, interactions, allergy reaction, overdose) | 25-prompt test set, emergency recall 100% |
| CH-6 | M | Escalation object `{required, level L0–L3, reason, suggested_contact}` | See safety.md |
| CH-7 | M | English and Tamil answers | Reply language = user language unless overridden |
| CH-8 | S | SSE streaming | `/v1/chat/stream` |
| CH-9 | S | "Add this question to my next appointment" payload returned for Member 2 | `suggested_actions[]` |

## C. Voice
| ID | P | Requirement | Acceptance |
|---|---|---|---|
| VO-1 | M | `POST /v1/voice/transcribe` Whisper on the AMD GPU, `language` hint en/ta/auto | Returns text + detected language + confidence proxy |
| VO-2 | M | Low-confidence transcript → "Did you say …?" confirm step instead of answering | `needs_confirmation: true` |
| VO-3 | M | TTS playback in the browser (Web Speech API) as the baseline | Works for en; Tamil depends on device voices, detect and show fallback text |
| VO-4 | C | Server-side Tamil TTS model on GPU | `POST /v1/voice/speak` |
| VO-5 | M | Translation check: all numbers and drug names in the source appear in the target; otherwise flagged `uncertain_translation` | Unit-tested |
| VO-6 | M | Dosage phrases rendered from a fixed EN→TA phrase table, not free LLM translation (Eka reviews the Tamil) | `data/phrases_ta.json` |

## D. Summaries
| ID | P | Requirement | Acceptance |
|---|---|---|---|
| SU-1 | M | `POST /v1/summaries` plain-language summary of a prescription or discharge summary (≤ 8th grade reading level), with "missing / inconsistent" section | Each sentence cited |
| SU-2 | S | Reading-level target via prompt + simple Flesch check | Reported in metrics |

## E. Safety and verification
| ID | P | Requirement |
|---|---|---|
| SF-1 | M | Disclaimer + "check with your doctor/pharmacist" only where relevant, not on every message |
| SF-2 | M | No PHI in logs; log ids, lengths, latency |
| SF-3 | M | Prompt-injection hygiene: document text is data, never instructions (see llm-prompts.md) |
| SF-4 | M | Human-review queue payload: every `needs_review` result includes `review_reasons[]` |
| SF-5 | S | Self-consistency check on high-risk fields (two passes must agree, else flag) |

## F. AMD deployment and evaluation
| ID | P | Requirement | Acceptance |
|---|---|---|---|
| AM-1 | M | vLLM on ROCm serving a Gemma vision-capable model on AMD Developer Cloud | `curl /v1/models` OK; `rocm-smi` screenshot under load |
| AM-2 | M | Whisper and embeddings on the same GPU | GPU memory table in `docs/amd-deployment.md` |
| AM-3 | M | `bench_latency.py`: concurrency 1/4/8/16 → p50/p95, tokens/s, requests/s | JSON in `eval/results/` |
| AM-4 | M | Extraction eval on 30 synthetic prescriptions with ground truth | Field accuracy, flag recall, per-field table |
| AM-5 | M | Chat eval: 40 questions (supported, unsupported, red-flag) | Groundedness, unsupported rate, escalation recall |
| AM-6 | S | Model-size trade-off table (e.g. 4B / 12B / 27B): accuracy vs latency | One chart for the deck |
| AM-7 | M | `/v1/health` and `/v1/metrics/benchmark` feed a live "Running on AMD" panel in the UI | Shows model, GPU name, last benchmark |
| AM-8 | M | Fallback: same code works against AMD Token Factory by env var | Documented |

## G. Non-functional
- p95 extraction < 15 s, chat < 6 s (non-stream) on the demo hardware.
- Docker image builds; `docker compose up` starts AI service (+ vLLM instructions).
- Public GitHub repo, MIT-compatible license, README that runs, no keys committed.
- Works with `MOCK_MODE=true` on a laptop with no GPU.

## H. Shared with Member 2 (agree TODAY)
- Contract in `docs/api-contract.md` frozen by end of Oct 15 (changes only via changelog).
- Member 2 stores documents and passes them in; Member 2 enforces permission before calling the AI service.
- Member 1 delivers three UI components for the hero flow inside `apps/web/src/features/ai/`: `PrescriptionReview`, `ChatPanel`, `VoiceButton`, plus `AmdPanel`. Member 2 owns the shell, routing, and design tokens.
