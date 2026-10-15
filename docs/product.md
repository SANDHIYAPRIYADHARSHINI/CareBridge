# product.md — CareBridge AI

## One line
Understand your prescription in your own language, know what is safe to ask the app and what needs a clinician, and let a trusted caregiver help, all in one place.

## Hackathon framing (Track 2: Health and Wellbeing)
The track asks us to make **one part of the patient journey** safer, clearer or easier, to **make uncertainty visible**, and to **know when a human must take over**. It forbids presenting autonomous diagnosis or treatment as advice.
So our pitch is NOT "a healthcare chatbot". It is:

> **"The prescription reader that shows you what it is sure about, what it is not, and exactly where on your paper it got each answer."**

Member 1's slice is the hero of the demo: Prescription Intelligence. Member 2's slice (caregivers, reminders, appointments, map) is the supporting journey.

## Users
- **Primary:** a patient (often older, often Tamil-speaking) holding a paper prescription or discharge summary they cannot fully read or remember.
- **Secondary:** a family caregiver who manages medicines for a parent.
- **Buyer / business value:** hospitals, pharmacies, and insurers who lose money on non-adherence and call-center load.

## Problem (use real numbers in the deck, with sources you verify)
Handwritten/printed prescriptions are hard to read; instructions get misunderstood; language barriers; scattered records; caregivers have no safe, consented way in. Missed or wrong doses cause avoidable readmissions. Find 2–3 citable stats (WHO medication adherence / "Medication Without Harm" are good starting points) and put the source on the slide. Do not quote a number you cannot link.

## Hero flow (the demo, ~3 minutes)
1. Patient uploads a photo of a synthetic prescription (Tamil/English mix, slightly rotated).
2. Within seconds: structured medicine cards appear next to the original image. Hover a field → its source line is highlighted on the image.
3. Two fields are flagged amber: one illegible strength, one frequency that conflicts with total quantity. The app does NOT guess; it asks the patient to confirm against the paper.
4. Patient confirms → reminders are created (Member 2).
5. Patient asks by voice in Tamil: "இதை சாப்பாட்டுக்கு முன்னாடியா பின்னாடியா சாப்பிடணும்?" → answer in Tamil with a citation chip pointing to the prescription line, plus audio playback.
6. Patient asks "Can I take this with my BP tablet?" → app refuses to judge, explains why, routes to pharmacist/doctor, offers to add the question to the next appointment.
7. Patient types "chest pain and sweating" → immediate emergency screen, nothing else.
8. Caregiver (approved by patient) sees the same record with restricted permissions (Member 2).
9. Slide: live AMD panel: model, GPU, p50/p95 latency, tokens/s, extraction accuracy on 30 synthetic prescriptions, unsupported-answer rate.

## What makes it original (say this out loud to judges)
- Evidence-linked extraction (field → source line on the image).
- Deterministic safety layers around the LLM (grounding gate, number/drug-name preservation check on translation, red-flag router) rather than "trust the model".
- Tamil-first voice flow with instruction-preserving translation checks.
- Benchmarked on AMD with a published eval, not just "it runs".

## Non-goals
Diagnosis, dosing advice, drug-interaction verdicts, real hospital integrations, real payments, real patient data, native mobile app.

## Success metrics (must have numbers by Oct 17)
- Field-level extraction accuracy on the 30-document synthetic set (target ≥ 90% on printed, report honestly for handwritten-style).
- Flag recall: share of deliberately corrupted fields the system flagged (target ≥ 90%).
- Unsupported-answer rate on 40 chat test questions (target ≤ 5%, with the refusal cases counted as correct).
- Escalation recall on 25 red-flag prompts (target 100% for emergency class).
- Latency: extraction p50/p95, chat p50/p95, tokens/s at concurrency 1/4/8/16 on AMD.
