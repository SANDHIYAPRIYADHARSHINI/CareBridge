# design-v2.md — CareBridge UI redesign (replaces docs/design.md where they differ)

## 0. Why v1 looks cheap (from the screenshots)
- **Dev leftovers in the product:** "Port 8100", a footer link "Demo: Test 'No Benchmark Yet' State", a fixtures toggle in the main header.
- **Header is broken:** wraps onto two lines in offline mode, shows a horizontal scrollbar, and the red-on-black "AMD Benchmarks" button clashes with everything (red is reserved for emergencies).
- **Dead space:** a huge empty dropzone with the icon floating far below the top, next to five stacked text cards. Nothing to look at, nothing to feel.
- **Tabs named like a dev tool:** "Upload Rx / Review / Ask Companion".
- **Engineer copy and overclaims:** "deterministic extraction powered by AMD ROCm", "Evaluated against real AMD ROCm models", "No hallucination". None of this is true yet and a patient does not care. Judges will test the claims.
- **Flat everything:** one beige, one card style, no hierarchy, no signature moment. The brief said "calm" and we delivered "plain".

## 1. North star
**"The paper is the interface."**
The patient's own prescription stays on screen as the hero. Everything the AI says is anchored to a spot on that paper with a highlighter-pen motif, and what it is unsure about is visibly less certain (ink style, not just a badge). The one-line feeling: *a very good pharmacist sitting next to you with a marker pen.*

References to study (save 5 to 6 screenshots in `docs/references/` and let the browser agent compare against them):
- **Apple Health, Oura:** big calm numerals, generous whitespace, one idea per card.
- **Ro, One Medical:** warm, editorial, trustworthy typography.
- **Ada Health:** clear step-by-step triage conversation.
- **Medisafe, MyTherapy:** how a medicine schedule is drawn (the "your day" ribbon).
- **Stripe, Linear:** precision of spacing, borders, motion timing.
Find real examples on Mobbin, Dribbble, Behance and 21st.dev. Do not copy; match the level of polish.

## 2. Two layers: patient layer and engineer layer
- **Patient layer** (default): warm paper surfaces, no technical words, no ports, no model names.
- **Engineer layer** ("Under the hood" drawer): a single dark ink-green panel, monospace numbers, model, device, per-step latency, tokens, evidence trace, benchmarks. Opened by a small icon in the top bar (keyboard: `.`). This is where AMD lives. It is also a clear moment in the demo video: "and here is what is running underneath".
- **Dev switches** (fixtures vs live, sample data) live ONLY inside Under the hood, or behind `?dev=1`. Never in the main header.
- The "Offline sample data, not live AI" badge stays visible whenever fixtures are on (honesty rule), but as a slim top strip, not a header item.

## 3. Visual system
**Surfaces:** canvas `#F4EFE6` (warm paper), card `#FBF8F2`, hairline `#DDD5C6`. Never pure white. A very subtle paper grain (SVG noise, 3 to 4 percent) on the canvas for a tactile feel. No dot grids, no radial orbs, no gradients.
**Ink:** `#17231F`, soft ink `#4A5753`.
**Primary:** deep teal `#0B5F5A` for primary actions and "matches the text".
**Signature accent: highlighter** `#FFD54A`. Used only for evidence: the swipe behind the matched text on the paper and on fields.
**Status (always icon + text, never colour alone):**
- Matches the text: teal check
- Needs your check: amber `#B96A00`, dashed underline
- Could not read: ink grey, struck-through placeholder, "Enter manually"
- Emergency: `#B3261E`, only on the emergency screen
**Engineer layer:** ink green `#0D2622` surface, paper-coloured text, one pale teal accent. No black-and-purple, no neon.
**Type** (self-host with `@fontsource` packages so the demo does not depend on venue Wi-Fi):
- Display: **Fraunces** (variable, use the optical-size axis at large sizes, no "wonk")
- UI and body: **Instrument Sans**
- Tamil: **Anek Tamil** (designed to sit next to Latin), fallback Noto Sans Tamil. Check Tamil rendering visually in every component.
- Numbers in the engineer layer only: JetBrains Mono
- Scale: hero `clamp(2.6rem, 5vw, 4.5rem)`, body 17 to 18px, Tamil body 18 to 19px, line-height 1.6
**Shape and depth:** radius 10 to 14px (not pill-everything), borders over shadows, one subtle elevation level. 8px spacing grid, generous padding (cards 24 to 32px).
**Icons:** Phosphor, one weight (regular), used sparingly and always with a label for medical actions.
**Anti-slop (from your checklist), enforced:** no harsh/rainbow/neon gradients, no purple-and-black, no pure white, no radial orbs, no sparkles, no glass, no stacked shadows, no coloured left-stripe cards, no three-identical-feature-cards row, no bento, no fake terminal, no emoji in UI, no em dashes in copy, no "it's not X, it's Y" copy, no checkmark-bullet lists, no fake testimonials, no animated arrows, no default hover-everything.
**But keep from the list:** skeleton loaders, privacy policy, terms, 404, real product shown (not mockups).

## 4. Information architecture (patient language)
Desktop: slim left rail (icon + label). Mobile (design this first, test at 390px): bottom tab bar.
1. **Today** (home): greeting, **Your day ribbon** (Morning / Afternoon / Night with pill chips generated from the confirmed prescription), a quiet "Add a prescription" card, recent documents.
2. **Add** (scan): one calm sheet. Camera or upload first. Samples shown as a **horizontal strip of real prescription thumbnails** (the actual PNGs), not five text cards.
3. **Check** (review, the hero): paper on the left, medicine cards on the right, evidence leader lines, confirm bar.
4. **Ask**: conversation about the prescription, citation chips, voice.
5. **Under the hood**: drawer (engineer layer).
Top bar: wordmark left; right side: language switch `EN | தமிழ்` (segmented control), Under the hood icon, avatar. Nothing else. Must never wrap or scroll sideways at 360px.

## 5. The signature interactions (this is the "wow")
1. **Scan sweep.** After upload, the real image sits centered with a thin teal scan line sweeping top to bottom (about 1.4s, loops until the response arrives). As OCR lines arrive they get a hairline outline one by one. Replaces the spinner narrative; keep the plain-language status text under it ("Reading the page", "Checking each field against the text").
2. **Paper to data.** When extraction returns, the medicine cards stagger in (60ms apart) from the right while the matching lines on the paper briefly flash a highlighter swipe.
3. **Evidence leader lines.** Hover or tap a field (name, strength, frequency) and a thin SVG curve draws (`pathLength` 0 to 1, 250ms) from the field to its exact line on the paper, with a highlighter swipe behind the text. Uses the real `bbox` and `evidence_line_ids`. Recompute on zoom/scroll/resize.
4. **Ink-style confidence.** Verified text is plain with a solid hairline underline. "Needs your check" has a dashed amber underline and a small plain-language reason. "Could not read" shows a struck-through placeholder and an "Enter manually" field.
5. **Confirm bar.** A sticky bottom bar: "Check 2 flagged items to continue" with a live counter (1 of 2). The button is disabled until done. On confirm: **shared-element transition**, each medicine card collapses into pill chips that fly into the Your day ribbon (motion `layoutId`). This is the money shot for the video.
6. **Snippet citations.** In Ask, a citation chip shows a **cropped thumbnail of the exact prescription line** (crop the image by `bbox`) plus "Line 4". Tap it to open the paper with that line highlighted. Nobody else will have this.
7. **Voice.** No orb. A composer with a live waveform bar along the bottom edge while recording, a detected-language chip ("Tamil"), and a read-back step for numbers.
8. **Emergency.** Full screen, calm and unmistakable: one large call button, nearest hospital action (Member 2), nothing else.
Motion rules: purposeful only, 180 to 450ms, ease-out, respect `prefers-reduced-motion` (replace with instant fades). No decorative loops except the scan line.

## 6. Library plan (what, where, why)
| Library | Use | Where |
|---|---|---|
| **motion.dev** (`motion`) | YES, all UI motion | scan sweep, stagger, leader-line draw, shared-element pill transition |
| **21st.dev** | YES, via shadcn registry | agent browses it and installs: file upload/dropzone, AI prompt/chat input, stepper/timeline, sheet/drawer, segmented tabs, badge, toast. Restyle with our tokens |
| **React Bits** | 3 pieces max | CountUp (benchmark numbers), SplitText or BlurText (landing headline), a subtle shiny-text for the loading line. No backgrounds |
| **Skiper UI** | optional | only if the agent finds a better card/interaction there than the 21st.dev option |
| **Lenis** | landing page only | smooth scroll for the public story page. Never inside the app |
| **realtimecolors.com** | YES, you do this | paste the 5 core colours and both fonts, check contrast of body, soft ink and amber on canvas |
| **GSAP** | LANDING ONLY (optional) | scroll-pinned "paper to data" sequence with ScrollTrigger, paired with Lenis. Never inside the app, where motion handles everything |
| **Barba.js** | evaluate, probably skip | it is for multi-page HTML transitions. Use only if the landing becomes separate pages; the React app uses motion route transitions instead |
| **Manus (manus.im)** | VISUAL REFERENCE | an agent product, not a library, but its marketing site is a good polish reference: spacing, typography, calm motion. Screenshot it into docs/references/ |
| **Bklit, ui.watermelon.sh** | BROWSE AND PICK | agent visits both and adopts a component only if it clearly beats the 21st.dev option (charts, timelines, cards). Otherwise skip, with the reason written down |

**Library rules (apply to everything above):**
1. Before building, the browser agent visits every URL on the list and writes `docs/ui-sources.md`: per site, 2 lines on what it offers and which exact components we take, or "skip" with a reason.
2. In the app, one animation library only (motion). GSAP and Lenis are for the landing page only.
3. Every adopted component is restyled with our tokens (no default demo look), installed via the shadcn/registry flow or copy-paste, and listed in `docs/ui-sources.md` with its source URL.
4. Check bundle size after adding anything; run build and lint.
5. Validate the palette and the two fonts on realtimecolors.com, screenshot it, and fix any contrast failure in the tokens.

## 7. Copy rules and replacements
Patient language only. No ports, no model names, no "deterministic", no "hallucination", no benchmark claims.
- Hero: **"Understand your prescription, line by line."**
- Sub: "Add a photo. We show what it says, where we found it, and what to double-check."
- Primary button: "Add a prescription"
- Processing: "Reading the page", "Matching each detail to the text", "Checking what needs your eyes"
- Flag reasons (plain): "Strength is hard to read", "Quantity does not match the days", "Same medicine listed twice"
- Ask empty state: "Ask about your prescription. I answer from your papers and tell you when your doctor or pharmacist should answer."
- Footer: "Synthetic demo data. Not medical advice. Clinicians decide." + Privacy + Terms
- AMD wording goes ONLY in Under the hood and the footer, and only states what is verified. Until a real GPU run exists: "Model: not connected". After: show the real model name and device from `/v1/health`.
- Tamil strings: mark every Tamil string `needs_native_review` in the i18n file; Eka reviews.

## 8. Landing page (phase F, only if everything else is done)
A scroll story using Lenis + motion scroll-linked animation:
1. Hero: a real prescription photo; as you scroll, lines get highlighted and lift into structured cards.
2. "It shows its sources": the snippet-citation chip, animated.
3. "It knows when to stop": a red-flag question turning into a calm referral.
4. "Speaks your language": Tamil and English side by side, numbers preserved.
5. "Under the hood": the dark engineer panel with real numbers (only once measured).
No three-card row, no bento, no testimonials, no pricing, no gradient blobs.

## 9. Build phases (give Antigravity one at a time; screenshot and critique after each)
- **A. Foundation (about 1 h):** tokens, `@fontsource` fonts, paper grain, new shell (top bar, left rail, mobile bottom bar), move dev switches into Under the hood, copy cleanup, fix header at 360, 768, 1440.
- **B. Check screen, the hero (about 2 h):** paper viewer, medicine cards, ink-style confidence, leader lines, highlighter swipes, confirm bar.
- **E. Under the hood drawer (about 45 min):** engineer layer, real `/v1/health` data, empty states, no fake numbers.
- **C. Today and Your day ribbon + shared-element transition (about 1.5 h).**
- **D. Ask: snippet citations, composer with waveform, language chip (about 1.5 h).**
- **Add screen:** scan sweep and thumbnail strip (about 1 h).
- **F. Landing (only with spare time).**
Do A, B, E first. If time runs out after that you still have a strong demo.

## 10. Critique loop (put in every phase prompt)
After building, use the browser agent to screenshot at 1440 and 390 wide, compare with `docs/references/`, list the five weakest things against this doc, fix them, and repeat once. Stop only when: no horizontal scroll at 360px, Tamil renders correctly, reduced-motion works, build and lint pass, and none of the anti-slop items appear.

## 11. Acceptance checklist
- [ ] A stranger can say what it does in 5 seconds
- [ ] No dev words visible to the patient layer
- [ ] Leader lines land on the right line for all 5 demo prescriptions
- [ ] Shared-element pill transition runs smoothly
- [ ] Citation chips show real cropped line thumbnails
- [ ] Header never wraps; no sideways scroll at 360px
- [ ] Offline strip visible whenever fixtures are on
- [ ] Emergency screen reachable in one tap
- [ ] No claim on screen that is not currently true
