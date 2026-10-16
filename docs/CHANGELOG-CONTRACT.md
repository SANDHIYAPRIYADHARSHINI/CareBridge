# CHANGELOG-CONTRACT.md — CareBridge API Contract Changelog

All contract changes between `services/ai/` and `apps/web/` are recorded here.

---

## [2026-10-16] — ExtractionResult image natural dimensions

### Added
- Added optional `image?: { width: number; height: number }` to `ExtractionResult`.
- **Rationale**: Enables client-side bounding box overlay (`ocr.lines[].bbox`) to compute percentage-based coordinates (`(bbox[0] / image.width) * 100%`, etc.), guaranteeing automatic, responsive scaling across arbitrary zoom levels, container resizing, and screen viewports without coordinate drift.
- **Backwards Compatibility**: Fully backwards compatible. When absent, clients fallback to rendered image `naturalWidth` and `naturalHeight` (or standard 1200x1600 synthetic demo resolution).
