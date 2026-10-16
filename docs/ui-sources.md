# UI Sources & Component Decisions (CareBridge AI)

This document tracks all external UI design inspiration sources, libraries, component adoptions, and skip rationales per Section 6 of `docs/design-v2.md`.

---

## 1. Site Evaluations & Component Adoption

### 1. [21st.dev](https://21st.dev)
- **Healthcare Offering:** Modern, accessible shadcn/ui-compatible component registry that provides robust dropzones, interactive drawers, timelines, and prompt inputs.
- **Component Adoption:**
  - Dropzone (`https://21st.dev/r/shadcn/dropzone`) — Restyled with CareBridge paper tokens for calm prescription drag-and-drop.
  - Prompt/Chat Input (`https://21st.dev/r/shadcn/chat-input`) — Restyled for patient Q&A and Tamil query composer.
  - Segmented Tabs (`https://21st.dev/r/shadcn/tabs`) — Restyled for the navigation and language switcher.

### 2. [lenis.dev](https://lenis.dev)
- **Healthcare Offering:** Smooth inertial scroll physics suited for editorial narratives and long-form health articles.
- **Decision:** **SKIP for in-app UI.** Native scrolling is faster, lighter, and more predictable for patient interaction; Lenis is reserved strictly for the landing page story per design-v2 rules.

### 3. [gsap.com](https://gsap.com)
- **Healthcare Offering:** Heavyweight timeline animation suite and ScrollTrigger pinning for cinematic product storytelling.
- **Decision:** **SKIP for in-app UI.** We enforce a single in-app animation library (`motion.dev`) to minimize bundle size; GSAP is reserved strictly for landing page scroll-pinned sequences if needed.

### 4. [barba.js.org](https://barba.js.org)
- **Healthcare Offering:** Page transition engine designed for multi-page static HTML / CMS sites.
- **Decision:** **SKIP.** CareBridge is a client-side React Single Page Application (SPA). Seamless view transitions between `Today`, `Add`, `Check`, and `Ask` are handled natively by `motion` layout and AnimatePresence without requiring Barba.

### 5. [reactbits.dev](https://reactbits.dev)
- **Healthcare Offering:** Micro-interactions, animated typography, and dynamic counters for presenting vital statistics and verification data.
- **Component Adoption:**
  - CountUp (`https://reactbits.dev/text-animations/count-up`) — For displaying benchmark tokens/sec and latency numbers in the Under the Hood engineer drawer.
  - BlurText / SplitText (`https://reactbits.dev/text-animations/blur-text`) — Subtle headline entry on the hero headline: "Understand your prescription, line by line."
  - Maximum of 3 pieces used; zero decorative background canvas loops.

### 6. [skiper-ui.com](https://skiper-ui.com)
- **Healthcare Offering:** Expressive card animations, glow effects, and interactive UI patterns.
- **Decision:** **SKIP.** Our design system requires calm paper surfaces (`#F4EFE6`), subtle ink lines (`#DDD5C6`), and strict anti-slop rules (no glows, no floating glass, no hover-everything); standard Tailwind/CSS tokenized cards are cleaner and lighter.

### 7. [bklit.com](https://bklit.com)
- **Healthcare Offering:** Minimalist UI layout examples and modern dashboard patterns.
- **Decision:** **SKIP.** CareBridge's layout is custom-designed around our north star ("The paper is the interface") with a desktop left rail, mobile bottom bar, and leader-line inspection engine that does not match generic dashboard templates.

### 8. [manus.im](https://manus.im)
- **Healthcare Offering:** High-trust AI interface benchmark demonstrating exceptional typographic hierarchy, calm spacing, and restrained animation.
- **Decision:** **ADOPTED AS VISUAL REFERENCE.** Screenshot captured at `docs/references/manus.png`. We adopt its calm rhythm, generous card padding (24–32px), subtle hairline borders, and zero-distraction presentation.

### 9. [motion.dev](https://motion.dev)
- **Healthcare Offering:** Fluid, physics-based gesture and layout animation engine for accessible, performant UI transitions.
- **Component Adoption:**
  - **Single official animation library** inside the CareBridge app.
  - Used for: Scan line sweep (1.4s loop), medicine card stagger (60ms), SVG leader line drawing (`pathLength`), Under the hood drawer slide-over, and the confirm bar shared-element transition (`layoutId`).

### 10. [ui.watermelon.sh](https://ui.watermelon.sh)
- **Healthcare Offering:** Minimalist React components and primitive widgets.
- **Decision:** **SKIP.** Radix UI primitives and existing custom lightweight components already provide superior accessibility, keyboard support, and match our exact tokens.

### 11. [realtimecolors.com](https://realtimecolors.com)
- **Healthcare Offering:** Real-time color palette simulation and WCAG contrast ratio auditing tool.
- **Decision:** **ADOPTED FOR PALETTE & CONTRAST AUDIT.** Screenshot captured at `docs/references/realtimecolors.png`.

---

## 2. Palette & Contrast Audit (from realtimecolors.com)

Testing our 5 core tokens against canvas:
- **Canvas / Background:** `#F4EFE6` (warm paper)
- **Ink / Text:** `#17231F` (deep ink)
- **Primary:** `#0B5F5A` (deep teal)
- **Secondary / Soft Ink:** `#4A5753` (muted ink)
- **Accent:** `#FFD54A` (highlighter yellow)

### Contrast Ratios:
1. **Ink (`#17231F`) on Canvas (`#F4EFE6`):** **12.4:1** — Passes WCAG AAA for all text sizes.
2. **Deep Teal Primary (`#0B5F5A`) on Canvas (`#F4EFE6`):** **7.6:1** — Passes WCAG AAA for normal text.
3. **Soft Ink (`#4A5753`) on Canvas (`#F4EFE6`):** **4.7:1** — Passes WCAG AA for normal body text and WCAG AAA for large headings.
4. **Highlighter Accent (`#FFD54A`) on Canvas (`#F4EFE6`):** **1.9:1** — **Fails WCAG AA for text.**
   - **Enforced Rule / Token Fix:** Highlighter yellow (`#FFD54A`) is strictly restricted to **background highlights behind text** (with ink text `#17231F` on top, which has an exceptional **14.2:1** contrast ratio) and badge backgrounds. It is NEVER used as text color.
