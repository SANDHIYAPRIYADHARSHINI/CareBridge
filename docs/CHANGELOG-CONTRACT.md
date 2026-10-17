# CHANGELOG-CONTRACT.md — CareBridge API Contract Changelog

All contract changes between `services/ai/` and `apps/web/` are recorded here.

---

## [2026-10-17] — Member 2 Server-to-Server AI Integration & Permission Gating

### Added
- Added Member 2 backend server-to-server proxy endpoints (`/ai/extract`, `/ai/chat`, `/ai/summaries`, `/ai/voice/transcribe`, `/ai/metrics/benchmark`, `/ai/health`).
- **Rationale**: Browsers communicate exclusively with the authenticated Member 2 backend (port 8080). Member 2 evaluates JWT identity, verifies patient consent and granular caregiver permissions (`can_view_prescriptions`, `can_view_records`), attaches audit log entries, and forwards authorized payloads server-to-server to Member 1's stateless AI service (port 8100).
- **Security & Privacy**: Zero unconsented patient health data is forwarded to Member 1; requests lacking valid caregiver consent are rejected with HTTP 403 Forbidden before reaching the AI model.
- **Backwards Compatibility**: Fully backwards compatible with existing Member 1 direct endpoints and offline synthetic fixtures.

---

## [2026-10-16] — ExtractionResult image natural dimensions

### Added
- Added optional `image?: { width: number; height: number }` to `ExtractionResult`.
- **Rationale**: Enables client-side bounding box overlay (`ocr.lines[].bbox`) to compute percentage-based coordinates (`(bbox[0] / image.width) * 100%`, etc.), guaranteeing automatic, responsive scaling across arbitrary zoom levels, container resizing, and screen viewports without coordinate drift.
- **Backwards Compatibility**: Fully backwards compatible. When absent, clients fallback to rendered image `naturalWidth` and `naturalHeight` (or standard 1200x1600 synthetic demo resolution).
