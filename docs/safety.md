# safety.md — non-negotiable behavior

Track 2 explicitly judges: handling of incorrect/unsupported responses, sensitive info, uncertain results, high-risk decisions, human review. Each section below maps to one of those. Put this on a slide.

## Principles
1. We read and explain; clinicians decide.
2. Uncertainty is shown, never smoothed over.
3. Deterministic checks wrap the model; the model never has the last word on safety.
4. When unsure whether something is high-risk, treat it as high-risk.

## Escalation levels
| Level | Meaning | Behavior |
|---|---|---|
| L0 | Answerable from the user's documents | Answer with citations |
| L1 | Answerable but worth confirming | Answer + one line: confirm with pharmacist |
| L2 | Needs clinical judgment | Do NOT answer the clinical part. Explain what the record says, say why we cannot advise, suggest doctor/pharmacist, offer to add the question to appointment notes |
| L3 | Possible emergency / crisis | Skip the LLM. Show emergency screen: call local emergency number, nearest hospital shortcut (Member 2), nothing else |

## Red-flag router (rules first, `data/redflags.json`)
Categories and default level:
- Emergency symptoms (chest pain, breathing difficulty, stroke signs, severe bleeding, unconsciousness, seizure, severe allergic reaction, overdose): **L3**
- Self-harm or suicidal language (English and Tamil): **L3**, supportive tone, crisis line + emergency number. Never include method information. Verify the current India crisis helpline numbers before shipping (e.g. Tele-MANAS) and keep them in config.
- Stop / skip / double / change dose, take extra, "can I stop": **L2**
- Drug-drug, drug-food, drug-alcohol interactions: **L2** (we may say what the prescription lists, never a verdict)
- Pregnancy, breastfeeding, children's dosing, kidney/liver conditions with dosing: **L2**
- Side-effect questions: general leaflet info from reference set allowed with L1 and a "tell your doctor if…" line; severe-sounding → L3/L2
- Diagnosis requests ("what disease do I have"): **L2**
- Medicine identification by pill appearance: **L2**
Tamil terms must be included in `redflags.json` (Eka to review with native phrasing). Add a unit test per category with EN and TA examples.

## Grounding gate
- Every factual sentence needs a citation to a provided document line or a reference-set entry.
- Reference set = small local `drugs.json`, each entry has `source_url`, `retrieved_on`, plain-language fields. Built by hand from public patient-information pages (e.g. MedlinePlus, NHS), then reviewed by a human. Never from model memory.
- Uncited sentences are removed. If the remaining answer is empty or the question is out of scope → templated refusal: "I can't find that in your documents. Here is what I can see: … Please ask your doctor or pharmacist."
- `support_status`: supported (all sentences cited), partial (some removed), unsupported (refusal).

## Extraction safety
- Evidence gate (RX-5): a value not supported by its cited OCR lines becomes `unclear`.
- No auto-correction of drug names. Suggestions only, labelled "did you mean".
- Any `warn`/`block` flag → `overall_status: needs_review`; reminders require explicit patient confirmation of the flagged fields against the original image (Member 2 UI gate).
- High-risk fields (strength, frequency, duration) get a second pass; disagreement → `conflict`.
- Always keep and link the original image (`document_id` → file) next to the extracted card.

## Translation safety
- Dosage phrases come from `phrases_ta.json` (fixed, human-reviewed), not free generation.
- Free text translation allowed only for explanations; after translation run `preservation_check`: every number and every drug name token from the source must appear in the target. Fail → `uncertain_translation` + show original English alongside.
- Show original and translation side by side for medical instructions.

## Voice safety
- Low STT confidence → read back the transcript and ask to confirm. Never answer a medically relevant question from a low-confidence transcript.
- Numbers heard in a transcript are echoed back in the confirm step.

## Privacy
- Synthetic data only in the demo, labelled "Synthetic demo data" in the UI footer.
- AI service stateless: no persistence of uploads beyond request; delete temp files in `finally`.
- Logs: request_id, endpoint, status, latency, byte counts. No text, no filenames with names.
- Prompt-injection: documents are wrapped in `<document>` tags and the system prompt states they are untrusted data; instructions inside documents are ignored and, if detected, flagged `prompt_injection_suspected`.
- Consent and caregiver permissions are enforced by Member 2 before the call; the AI service only sees what it is given.

## What the demo must show (checklist for the video)
- [ ] An amber flag where the system refused to guess
- [ ] A field → source highlight
- [ ] A refusal-with-reason for a clinical question
- [ ] An L3 emergency screen
- [ ] A Tamil answer with a preserved-numbers check
- [ ] A human-review path ("ask pharmacist / add to appointment notes")
