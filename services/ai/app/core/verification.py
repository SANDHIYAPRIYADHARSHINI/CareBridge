"""Prescription verification engine, evidence gate, and clinical conflict rules.

Implements RX-4, RX-5, RX-6, RX-8:
- Evidence gate: validates that extracted field values are supported by cited OCR lines
  using fuzzy token and substring matching; downgrades unsupported fields to 'unclear'.
- Conflict rules:
  1. Quantity vs. Frequency × Duration calculation mismatch.
  2. Duplicate drug detection.
  3. Missing or unclear strength.
  4. Unusual strength vs. reference formulary.
  5. Drug name suggestions (RX-9) without auto-replacing.
- Overall status and review_reasons generation for human review queue.
"""

from __future__ import annotations

import difflib
import json
import logging
import re
from pathlib import Path
from typing import Any

from app.core.frequency import normalize_frequency
from app.schemas.common import ExtractedField, Flag, OcrLine
from app.schemas.prescription import Medicine, OverallStatus, Suggestion

logger = logging.getLogger("carebridge.ai.verification")

# Punctuation stripper for clean token comparison
PUNCT_RE = re.compile(r"[^\w\s\u0B80-\u0BFF]")
NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")


def _normalize_str(s: str) -> str:
    """Lowercases, strips punctuation, and normalizes whitespace."""
    s_clean = PUNCT_RE.sub(" ", s.lower())
    return " ".join(s_clean.split())


def _extract_numbers(s: str) -> list[str]:
    """Extracts all numeric tokens from a string."""
    return NUMBER_RE.findall(s)


def is_text_supported(field_value: str, cited_text: str, min_similarity: float = 0.65) -> bool:
    """Checks whether field_value is fuzzy-supported by the cited OCR text.

    Requires:
    1. All numeric tokens in field_value must exist in cited_text.
    2. Words in field_value must either be a subset of cited_text tokens or
       exhibit high sequence similarity to a substring within cited_text.
    """
    val_norm = _normalize_str(field_value)
    cited_norm = _normalize_str(cited_text)

    if not val_norm:
        return True

    # Direct substring match
    if val_norm in cited_norm:
        return True

    # 1. Numeric check: all numbers in value must appear in cited text
    val_numbers = _extract_numbers(field_value)
    cited_numbers = set(_extract_numbers(cited_text))
    for num in val_numbers:
        if num not in cited_numbers:
            return False

    # 2. Token overlap check
    val_tokens = val_norm.split()
    cited_tokens = set(cited_norm.split())

    if not val_tokens:
        return True

    # Check how many tokens match or fuzzy-match
    matched_tokens = 0
    for vt in val_tokens:
        if vt in cited_tokens:
            matched_tokens += 1
        else:
            # Fuzzy check against any cited token
            close_matches = [
                ct for ct in cited_tokens if difflib.SequenceMatcher(None, vt, ct).ratio() >= 0.75
            ]
            if close_matches:
                matched_tokens += 1

    overlap_ratio = matched_tokens / len(val_tokens)
    if overlap_ratio >= 0.75:
        return True

    # 3. Sliding window substring similarity for phrases
    val_len = len(val_norm)
    if val_len > 3 and len(cited_norm) >= val_len:
        best_sim = 0.0
        step = max(1, val_len // 4)
        for i in range(0, len(cited_norm) - val_len + 1, step):
            window = cited_norm[i : i + val_len]
            sim = difflib.SequenceMatcher(None, val_norm, window).ratio()
            if sim > best_sim:
                best_sim = sim
            if best_sim >= min_similarity:
                return True

    return False


def apply_evidence_gate(
    field: ExtractedField,
    ocr_lines_by_id: dict[str, OcrLine],
    field_name: str = "field",
) -> ExtractedField:
    """Verifies a single field against its cited OCR lines.

    If cited lines are missing or the field value is not supported by the cited text,
    the field is downgraded to status='unclear' and value=None.
    """
    if field.status == "missing" or not field.value:
        return field

    if not field.evidence_line_ids:
        logger.debug("Evidence gate failed for %s: missing evidence_line_ids", field_name)
        return ExtractedField(
            value=None,
            raw=field.raw,
            status="unclear",
            confidence=round(min(field.confidence, 0.4), 2),
            evidence_line_ids=[],
        )

    # Collect cited text
    cited_texts = [
        ocr_lines_by_id[lid].text for lid in field.evidence_line_ids if lid in ocr_lines_by_id
    ]

    if not cited_texts:
        logger.debug(
            "Evidence gate failed for %s: cited lines %s not found in OCR",
            field_name,
            field.evidence_line_ids,
        )
        return ExtractedField(
            value=None,
            raw=field.raw,
            status="unclear",
            confidence=round(min(field.confidence, 0.35), 2),
            evidence_line_ids=field.evidence_line_ids,
        )

    combined_cited = " ".join(cited_texts)
    supported = is_text_supported(field.value, combined_cited)

    if not supported:
        logger.debug(
            "Evidence gate downgraded %s: '%s' not supported by cited '%s'",
            field_name,
            field.value,
            combined_cited,
        )
        return ExtractedField(
            value=None,
            raw=field.raw,
            status="unclear",
            confidence=round(min(field.confidence, 0.35), 2),
            evidence_line_ids=field.evidence_line_ids,
        )

    return field


def load_reference_drugs() -> list[dict[str, Any]]:
    """Loads the reference drugs formulary."""
    candidates = [
        Path(__file__).resolve().parent.parent.parent / "data" / "reference" / "drugs.json",
        Path(__file__).resolve().parent.parent / "data" / "reference" / "drugs.json",
    ]
    for cand in candidates:
        if cand.exists():
            try:
                with open(cand, encoding="utf-8") as f:
                    return json.load(f)
            except Exception as exc:
                logger.warning("Could not load reference drugs from %s: %s", cand, exc)
    return []


def parse_duration_days(duration_str: str | None) -> int | None:
    """Parses duration string like '7 days', '2 weeks', '1 month' into total days."""
    if not duration_str:
        return None
    s = duration_str.lower().strip()

    match_days = re.search(r"(\d+)\s*(?:days?|d)\b", s)
    if match_days:
        return int(match_days.group(1))

    match_weeks = re.search(r"(\d+)\s*(?:weeks?|wk|w)\b", s)
    if match_weeks:
        return int(match_weeks.group(1)) * 7

    match_months = re.search(r"(\d+)\s*(?:months?|mo|m)\b", s)
    if match_months:
        return int(match_months.group(1)) * 30

    # Bare number assumed to be days
    match_bare = re.match(r"^(\d+)$", s)
    if match_bare:
        return int(match_bare.group(1))

    return None


def parse_prescribed_quantity(medicine: Medicine) -> int | None:
    """Extracts explicit quantity from instructions, dose, or raw text."""
    search_texts = [
        medicine.instructions.value or "",
        medicine.dose.value or "",
        medicine.duration.raw or "",
    ]
    full_text = " ".join(search_texts)

    patterns = [
        r"(?:qty|quantity|total|#)\s*[:=-]?\s*(\d+)",
        r"\b(\d+)\s*(?:tabs?|tablets?|caps?|capsules?)\b",
        r"(?:x|\*)\s*(\d+)\b",
    ]
    for pat in patterns:
        m = re.search(pat, full_text, re.IGNORECASE)
        if m:
            return int(m.group(1))

    return None


def verify_prescription_rules(
    medicines: list[Medicine],
    ocr_lines: list[OcrLine],
    reference_drugs: list[dict[str, Any]] | None = None,
) -> tuple[list[Medicine], list[Flag], OverallStatus, list[str]]:
    """Evaluates conflict rules, calculates flags, medicine statuses, and overall status.

    Returns:
        (updated_medicines, flags, overall_status, review_reasons)
    """
    if reference_drugs is None:
        reference_drugs = load_reference_drugs()

    flags: list[Flag] = []
    review_reasons: list[str] = []
    seen_drug_names: dict[str, int] = {}

    for idx, med in enumerate(medicines):
        med_flags: list[Flag] = []
        med_name = (med.name.value or med.name.raw or f"Medicine #{idx + 1}").strip()
        name_norm = _normalize_str(med_name)

        # 1. Missing or unclear strength check (RX-6, RX-8)
        if med.strength.status in ("missing", "unclear") or not med.strength.value:
            flag = Flag(
                id=f"flag-str-{idx + 1}",
                severity="warn",
                code="MISSING_STRENGTH",
                message=f"Missing or unclear strength for '{med_name}'.",
                field_path=f"medicines[{idx}].strength",
                evidence_line_ids=med.strength.evidence_line_ids or med.name.evidence_line_ids,
            )
            flags.append(flag)
            med_flags.append(flag)

        # 2. Duplicate drug check (RX-8)
        if name_norm:
            if name_norm in seen_drug_names:
                prev_idx = seen_drug_names[name_norm]
                flag = Flag(
                    id=f"flag-dup-{idx + 1}",
                    severity="warn",
                    code="DUPLICATE_DRUG",
                    message=(
                        f"Duplicate drug detected: '{med_name}' appears multiple times "
                        f"(item {prev_idx + 1} and item {idx + 1})."
                    ),
                    field_path=f"medicines[{idx}].name",
                    evidence_line_ids=med.name.evidence_line_ids,
                )
                flags.append(flag)
                med_flags.append(flag)
            else:
                seen_drug_names[name_norm] = idx

        # 3. Normalize frequency and verify Quantity vs. Frequency × Duration (RX-7, RX-8)
        if med.frequency.value and not med.frequency_normalized:
            med.frequency_normalized = normalize_frequency(med.frequency.value)

        times_per_day = med.frequency_normalized.times_per_day if med.frequency_normalized else None
        duration_days = parse_duration_days(med.duration.value)
        explicit_qty = parse_prescribed_quantity(med)

        if times_per_day is not None and duration_days is not None and explicit_qty is not None:
            expected_qty = times_per_day * duration_days
            if explicit_qty != expected_qty and not (
                med.frequency_normalized and med.frequency_normalized.as_needed
            ):
                flag = Flag(
                    id=f"flag-qty-{idx + 1}",
                    severity="warn",
                    code="QUANTITY_DURATION_MISMATCH",
                    message=(
                        f"Prescribed quantity ({explicit_qty}) conflicts with frequency "
                        f"({times_per_day}/day) × duration ({duration_days} days) = {expected_qty}."
                    ),
                    field_path=f"medicines[{idx}].duration",
                    evidence_line_ids=list(
                        set(med.duration.evidence_line_ids + med.frequency.evidence_line_ids)
                    ),
                )
                flags.append(flag)
                med_flags.append(flag)

        # 4. Check against Reference Formulary (RX-8, RX-9)
        ref_match = None
        for ref in reference_drugs:
            if _normalize_str(ref["name"]) == name_norm or (
                "name_ta" in ref and _normalize_str(ref["name_ta"]) == name_norm
            ):
                ref_match = ref
                break

        if ref_match:
            # Check unusual strength
            if med.strength.value and "strengths" in ref_match:
                med_str_norm = _normalize_str(med.strength.value)
                ref_strs_norm = [_normalize_str(s) for s in ref_match["strengths"]]
                if med_str_norm not in ref_strs_norm:
                    ref_s = ref_match["strengths"]
                    flag = Flag(
                        id=f"flag-str-ref-{idx + 1}",
                        severity="warn",
                        code="UNUSUAL_STRENGTH",
                        message=(
                            f"Extracted strength '{med.strength.value}' for '{med_name}' "
                            f"is unusual compared to reference formulary ({ref_s})."
                        ),
                        field_path=f"medicines[{idx}].strength",
                        evidence_line_ids=med.strength.evidence_line_ids,
                    )
                    flags.append(flag)
                    med_flags.append(flag)
        else:
            # Fuzzy match for 'did you mean' suggestions (RX-9)
            if name_norm:
                for ref in reference_drugs:
                    ratio = difflib.SequenceMatcher(
                        None, name_norm, _normalize_str(ref["name"])
                    ).ratio()
                    if 0.72 <= ratio < 1.0:
                        pct = int(ratio * 100)
                        med.suggestions.append(
                            Suggestion(
                                field="name",
                                suggested_value=ref["name"],
                                reason=f"Closest match in reference formulary ({pct}% match)",
                            )
                        )
                        break

        # Assign medicine status
        if med_flags:
            med.status = "needs_review"
        elif med.name.status == "found" and med.frequency.status == "found":
            med.status = "verified_by_rules"
        else:
            med.status = "needs_review"

    # Compute overall status & review reasons
    if len(ocr_lines) == 0:
        overall_status: OverallStatus = "unreadable"
        review_reasons.append("No text could be extracted from document.")
    else:
        warn_or_block = [f for f in flags if f.severity in ("warn", "block")]
        if warn_or_block:
            overall_status = "needs_review"
            for f in warn_or_block:
                review_reasons.append(f"{f.code}: {f.message}")
        else:
            overall_status = "ready"

    return medicines, flags, overall_status, review_reasons
