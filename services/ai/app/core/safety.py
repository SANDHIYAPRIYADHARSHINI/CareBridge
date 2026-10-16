"""Safety verification engine, red-flag routing, and grounding gate for CareBridge AI.

Implements non-negotiable safety behavior per docs/safety.md:
- Deterministic red-flag router over data/redflags.json:
  - Emergency symptoms and self-harm immediately trigger L3 and skip LLM.
  - Clinical judgment requests (dose changes, interactions, diagnosis) trigger L2.
  - General side-effect advisories trigger L1.
  - Document-backed questions trigger L0.
- Grounding gate:
  - Validates that every factual sentence carries valid citations to provided documents.
  - Strips uncited sentences.
  - Sets support_status to 'supported', 'partial', or 'unsupported'.
  - Unanswerable or unsupported questions return templated refusals.
- Tamil preservation checks:
  - Validates that numbers and drug tokens from the source are preserved.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from app.config import Settings, get_settings
from app.schemas.chat import Citation, SuggestedAction, SupportStatus, TranslationCheck

logger = logging.getLogger("carebridge.ai.safety")

# Regex to strip non-alphanumeric punctuation while strictly preserving Tamil unicode
CLEAN_RE = re.compile(r"[^\w\s\u0B80-\u0BFF]")
NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")


def normalize_text(text: str) -> str:
    """Lowercases, normalizes whitespace, and strips non-Tamil punctuation."""
    cleaned = CLEAN_RE.sub(" ", text.lower())
    return " ".join(cleaned.split())


@dataclass
class RedFlagCategory:
    id: str
    name: str
    default_level: Literal["L0", "L1", "L2", "L3"]
    suggested_contact: Literal["none", "pharmacist", "doctor", "emergency", "crisis_line"]
    description: str
    en_patterns: list[str]
    ta_patterns: list[str]


@dataclass
class RedFlagMatch:
    is_triggered: bool
    category: str | None
    level: Literal["L0", "L1", "L2", "L3"]
    reason: str | None
    suggested_contact: Literal["none", "pharmacist", "doctor", "emergency", "crisis_line"]
    matched_terms: list[str] = field(default_factory=list)

    @property
    def skips_llm(self) -> bool:
        """Emergency symptoms and self-harm strictly skip LLM inference."""
        return self.level == "L3"


class RedFlagRouter:
    """Deterministic red-flag classifier driven by data/redflags.json."""

    def __init__(self, redflags_path: Path | None = None) -> None:
        self.settings = get_settings()
        self.redflags_path = redflags_path or (self.settings.DATA_DIR / "redflags.json")
        self.categories: list[RedFlagCategory] = self._load_categories()

    def _load_categories(self) -> list[RedFlagCategory]:
        if not self.redflags_path.exists():
            logger.warning("Redflags definition file not found at %s", self.redflags_path)
            return []

        try:
            with open(self.redflags_path, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            logger.error("Failed to parse redflags JSON: %s", e)
            return []

        cats: list[RedFlagCategory] = []
        for item in data.get("categories", []):
            en_terms = [t.lower().strip() for t in item.get("en_patterns", []) if t.strip()]
            ta_terms = [
                t["text"].lower().strip()
                for t in item.get("ta_patterns", [])
                if isinstance(t, dict) and t.get("text", "").strip()
            ]
            cats.append(
                RedFlagCategory(
                    id=item.get("id", "unknown"),
                    name=item.get("name", ""),
                    default_level=item.get("default_level", "L0"),
                    suggested_contact=item.get("suggested_contact", "none"),
                    description=item.get("description", ""),
                    en_patterns=en_terms,
                    ta_patterns=ta_terms,
                )
            )

        # Ensure priority order: L3 emergency & self_harm are checked first
        level_order = {"L3": 0, "L2": 1, "L1": 2, "L0": 3}
        cats.sort(key=lambda c: level_order.get(c.default_level, 99))
        return cats

    def check(self, query: str) -> RedFlagMatch:
        """Inspects the query against all red-flag patterns."""
        norm_query = normalize_text(query)
        if not norm_query:
            return RedFlagMatch(
                is_triggered=False,
                category=None,
                level="L0",
                reason=None,
                suggested_contact="none",
            )

        for cat in self.categories:
            matched: list[str] = []
            # Check English terms
            for term in cat.en_patterns:
                # Word boundary match for short terms, substring for phrases
                if " " in term:
                    if term in norm_query:
                        matched.append(term)
                else:
                    pattern = rf"\b{re.escape(term)}\b"
                    if re.search(pattern, norm_query):
                        matched.append(term)

            # Check Tamil terms
            for term in cat.ta_patterns:
                if term in norm_query or term in query:
                    matched.append(term)

            if matched:
                reason = (
                    f"Red-flag safety trigger [{cat.name}]: detected '{', '.join(matched)}'."
                )
                return RedFlagMatch(
                    is_triggered=True,
                    category=cat.id,
                    level=cat.default_level,
                    reason=reason,
                    suggested_contact=cat.suggested_contact,
                    matched_terms=matched,
                )

        return RedFlagMatch(
            is_triggered=False,
            category=None,
            level="L0",
            reason=None,
            suggested_contact="none",
        )


class GroundingGate:
    """Verifies that all sentences generated by the model are supported by citations."""

    @staticmethod
    def verify(
        sentences: list[dict[str, Any]],
        available_citations: dict[str, Citation],
    ) -> tuple[list[dict[str, Any]], SupportStatus, list[str]]:
        """Filters sentences, removing any that lack valid, supported citations.

        Returns:
            kept_sentences: Sentences with at least one valid citation
            support_status: 'supported' | 'partial' | 'unsupported'
            uncertainty_notes: Explanations of removed sentences
        """
        if not sentences:
            return [], "unsupported", ["No sentences were produced by the assistant."]

        kept: list[dict[str, Any]] = []
        removed: list[dict[str, Any]] = []

        for s in sentences:
            raw_text = s.get("text", "").strip()
            citation_ids = s.get("citation_ids", [])

            # Check if at least one citation id exists in the available citations dict
            valid_cids = [cid for cid in citation_ids if cid in available_citations]

            if valid_cids and raw_text:
                kept.append({**s, "citation_ids": valid_cids})
            else:
                removed.append(s)

        if not kept:
            return (
                [],
                "unsupported",
                [
                    "All sentences lacked valid document citations and were removed "
                    "by the grounding gate."
                ],
            )

        if removed:
            note = f"Grounding gate removed {len(removed)} uncited sentence(s) from the answer."
            return kept, "partial", [note]

        return kept, "supported", []


class TemplatedRefusals:
    """Localized deterministic safety refusals."""

    @staticmethod
    def emergency(language: str, settings: Settings | None = None) -> str:
        cfg = settings or get_settings()
        num = cfg.EMERGENCY_NUMBER
        if language == "ta":
            return (
                f"இது ஒரு தீவிர அவசர மருத்துவ நிலையாகத் தோன்றுகிறது. "
                f"உடனடியாக அவசர உதவி எண்ணை ({num}) அழைக்கவும் அல்லது "
                f"அருகிலுள்ள மருத்துவமனை அவசர சிகிச்சைப் பிரிவுக்குச் செல்லவும். "
                f"நீங்களாக வாகனம் ஓட்ட முயற்சிக்காதீர்கள்."
            )
        return (
            f"This sounds like a life-threatening medical emergency. "
            f"Please call emergency services immediately ({num}) or go to the "
            f"nearest emergency room. Do not attempt to drive yourself."
        )

    @staticmethod
    def crisis(language: str, settings: Settings | None = None) -> str:
        cfg = settings or get_settings()
        crisis_num = cfg.CRISIS_HELPLINE_NUMBER
        crisis_name = cfg.CRISIS_HELPLINE_NAME
        emerg_num = cfg.EMERGENCY_NUMBER
        if language == "ta":
            return (
                f"நீங்கள் கடுமையான மன உளைச்சலில் இருந்தால் அல்லது உங்களுக்கு ஏதேனும் "
                f"ஆபத்தான எண்ணங்கள் தோன்றினால், தயவுசெய்து உடனடியாக உதவி பெறவும். "
                f"நீங்கள் தனியாக இல்லை. மனநல உதவி எண் {crisis_num} ({crisis_name}) "
                f"அல்லது அவசர சேவையை ({emerg_num}) அழைக்கவும்."
            )
        return (
            f"If you are going through a difficult time or having thoughts of self-harm, "
            f"please know that you are not alone. Immediate support is available. "
            f"Please reach out to the {crisis_name} helpline at {crisis_num} "
            f"or contact emergency services at {emerg_num}."
        )

    @staticmethod
    def clinical_refusal(language: str, reason: str | None = None) -> str:
        if language == "ta":
            return (
                "உங்கள் மருந்து அளவை மாற்றுவது, நிறுத்துவது அல்லது மருந்துகளை ஒன்றாக எடுப்பது குறித்து "
                "என்னால் மருத்துவ ஆலோசனை வழங்க முடியாது. எந்த மாற்றத்தையும் செய்வதற்கு முன் உங்கள் மருத்துவர் "
                "அல்லது மருந்தாளுநரை அணுகவும்."
            )
        return (
            "I cannot advise you on starting, stopping, skipping, or altering your "
            "medication dosage or interactions. Such decisions require clinical judgment. "
            "Please consult your prescribing doctor or pharmacist before making any changes."
        )

    @staticmethod
    def ungrounded(language: str, summary_hint: str | None = None) -> str:
        if language == "ta":
            if summary_hint:
                return (
                    f"உங்கள் மருத்துவ ஆவணங்களில் இந்த விவரம் காணப்படவில்லை. "
                    f"ஆவணத்தில் உள்ள விவரம்: {summary_hint}. "
                    f"மேலும் விவரங்களுக்கு உங்கள் மருத்துவரிடம் கேட்கவும்."
                )
            return (
                "உங்கள் மருத்துவ ஆவணங்களில் இந்தக் கேள்விக்கான தகவல் காணப்படவில்லை. "
                "தயவுசெய்து உங்கள் மருத்துவர் அல்லது மருந்தாளுநரிடம் கேட்கவும்."
            )

        if summary_hint:
            return (
                f"I cannot find that in your provided medical documents. "
                f"Here is what I can see: {summary_hint}. "
                f"Please ask your doctor or pharmacist."
            )
        return (
            "I cannot find that information in your provided documents. "
            "Please ask your doctor or pharmacist."
        )

    @staticmethod
    def get_emergency_actions(settings: Settings | None = None) -> list[SuggestedAction]:
        cfg = settings or get_settings()
        return [
            SuggestedAction(
                type="call_emergency",
                payload={
                    "number": cfg.EMERGENCY_NUMBER,
                    "description": "Ambulance Emergency Helpline",
                },
            )
        ]

    @staticmethod
    def get_crisis_actions(settings: Settings | None = None) -> list[SuggestedAction]:
        cfg = settings or get_settings()
        return [
            SuggestedAction(
                type="call_emergency",
                payload={
                    "number": cfg.CRISIS_HELPLINE_NUMBER,
                    "name": cfg.CRISIS_HELPLINE_NAME,
                    "description": "National Tele Mental Health Helpline",
                },
            )
        ]

    @staticmethod
    def get_clinical_actions(topic: str = "Medication guidance") -> list[SuggestedAction]:
        return [
            SuggestedAction(
                type="add_to_appointment_notes",
                payload={
                    "topic": topic,
                    "question": "Patient asked for medication dosage/interaction guidance.",
                },
            ),
            SuggestedAction(
                type="contact_pharmacist",
                payload={"message": "Consult your pharmacist regarding medication instructions."},
            ),
        ]


def check_preservation(
    source_text: str,
    target_text: str,
    drug_names: list[str] | None = None,
) -> TranslationCheck:
    """Verifies that all numbers and drug name tokens from the source appear in target text.

    Used to satisfy VO-5 and Tamil translation safety.
    """
    src_numbers = set(NUMBER_RE.findall(source_text))
    tgt_numbers = set(NUMBER_RE.findall(target_text))
    numbers_preserved = src_numbers.issubset(tgt_numbers)

    drug_names_preserved = True
    if drug_names:
        tgt_lower = target_text.lower()
        for dname in drug_names:
            if dname.lower() in source_text.lower() and dname.lower() not in tgt_lower:
                drug_names_preserved = False
                break

    status = "ok" if (numbers_preserved and drug_names_preserved) else "uncertain_translation"
    return TranslationCheck(
        numbers_preserved=numbers_preserved,
        drug_names_preserved=drug_names_preserved,
        status=status,
    )


@lru_cache
def get_redflag_router() -> RedFlagRouter:
    """Cached singleton instance of RedFlagRouter."""
    return RedFlagRouter()
