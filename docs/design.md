# design.md — UI rules (applies to Member 1's components and the whole app)

Source: Eka's "AI slop" checklists (screenshots) + pre-launch checklist, adapted to a patient-facing health app.

## Feel
Calm, trustworthy, human. Like a well-designed paper form and a good pharmacist, not a SaaS landing template. Large readable type (older users, Tamil script), generous spacing, high contrast.

## Do NOT (from the anti-slop list)
Harsh/rainbow/neon gradients, purple-and-black, pastel-default palettes, pure white background, radial orbs, dot grids, sparkle icons, liquid-glass, drop-shadow stacks, colored left-border stripe cards, three identical feature cards in a row, bento grids, fake terminal window, emoji as UI, em dashes in copy, "it's not X, it's Y" copy, checkmark-bullet lists, 3-tier pricing, fake testimonials, animated arrows, hover-animation on everything, default Inter / Geist / Space Grotesk, default Lucide-everywhere look.
## DO
- **Real product shown**, never mockups: the hero is the actual prescription-review screen with a real synthetic prescription.
- **Skeleton loaders** for OCR/LLM waits, plus a progress narrative ("Reading the page", "Checking each field against the text") instead of a spinner.
- **Privacy policy, Terms, 404, error pages** exist (health data!). Footer: "Synthetic demo data. Not medical advice."
- Alt text on every image; full keyboard navigation; visible focus rings; `lang="ta"` on Tamil text.
- Meta title/description + Open Graph image on the public landing page only (the app itself is behind login; SSR/sitemap/robots/schema/301s from the launch list are NOT needed for a hackathon SPA, skip them).
- Simple working feedback/contact form or mailto in the footer.

## Tokens (starting point, tune on realtimecolors.com for contrast ≥ 4.5:1, check Tamil text too)
```
--paper:   #F5F1E8   /* warm off-white, not pure white */
--ink:     #1C2826
--ink-soft:#4B5A57
--primary: #0E5A56   /* deep teal */
--primary-ink: #F5F1E8
--line:    #D9D2C3
--ok:      #2F6B3F
--warn:    #B76E00   /* amber: "please verify" */
--danger:  #A8231B   /* emergency only */
--highlight: #F2D98A /* evidence highlight on the source image */
```
Typography: headings **Fraunces** (or Newsreader), body **Instrument Sans** (or Source Sans 3), Tamil **Noto Sans Tamil** (fallback chain mandatory), mono **JetBrains Mono** only for numbers like benchmarks. Body ≥ 17px, Tamil body ≥ 18px, line-height 1.6+.
Radius: modest (6–10px), not pill-everything. Shadows: one subtle elevation level max. Borders over shadows.
Icons: one consistent set (Phosphor or Tabler, not default Lucide look), used sparingly, always with text labels for medical actions.

## Status language (consistent everywhere)
- Verified by rules: teal check-circle + "Matches the text"
- Needs your check: amber with the exact reason ("Strength is hard to read")
- Could not read: grey with "Enter manually"
- Emergency: full-screen danger panel, one big call button
Never rely on color alone: always icon + text.

## Libraries: what to use from the list (Member 2 owns the shell; use only what earns its place)
| Library | Use? | Why |
|---|---|---|
| **21st.dev** | YES (main source) | shadcn/Radix-style copy-paste components: forms, dialogs, tabs, command palette, upload dropzone. Restyle with our tokens |
| **motion.dev** (`motion`) | YES | Layout transitions for medicine cards appearing, highlight-to-source morph, emergency panel entrance. Respect `prefers-reduced-motion` |
| **Lenis** | Landing page only | Smooth scroll for the public landing; never inside the app |
| **React Bits** | At most 1–2 | e.g. a count-up for benchmark numbers or a subtle text reveal on the landing hero. Skip the flashy backgrounds |
| **realtimecolors.com** | YES | Validate palette and contrast before building |
| Skiper UI / ui.watermelon.sh | Optional | Only if you find a specific component (e.g. a stepper or file uploader) cheaper than building it |
| GSAP | Skip | Overkill for 3 days; motion covers it |
| Barba.js | Skip | Page transitions for multi-page HTML sites, not a React SPA |
| Manus.im | Skip | An agent product, not a UI library |
| Bklit | Skip unless verified | Unsure it fits; use Recharts for the benchmark chart |
Components Member 1 builds: `PrescriptionReview` (image left with zoom + line highlight, medicine cards right), `ChatPanel` (citations as small chips that highlight the source), `VoiceButton` (hold or tap to record, waveform, confirm-transcript step), `AmdPanel` (model, GPU, p50/p95, tokens/s, accuracy; real numbers from `/v1/metrics/benchmark`).

## Screens for the hero flow
1. Upload (dropzone + "Use a sample synthetic prescription" button, important for judges)
2. Review (split view, flags, confirm button disabled until flagged fields acknowledged)
3. Ask (chat + voice, language toggle EN / தமிழ்)
4. Emergency (L3)
5. AMD panel (collapsible drawer, also a full page for the video)
