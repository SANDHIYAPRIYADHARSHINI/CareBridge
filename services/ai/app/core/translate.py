"""Dosage phrase translation engine and Tamil preservation checker.

Implements TR-1 through TR-4 per docs/safety.md and docs/api-contract.md:
- Deterministic phrase table translation from data/phrases_ta.json for dosage instructions.
- LLM translation fallback for free-form clinical explanations.
- Mandatory number and drug-name preservation verification (check_preservation).
- Method tracking: 'phrase_table', 'llm', or 'mixed'.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from app.config import Settings, get_settings
from app.core.llm import LLMClient
from app.core.safety import check_preservation
from app.schemas.chat import TranslationCheck

logger = logging.getLogger("carebridge.ai.translate")


@dataclass
class TranslationResult:
    text: str
    translation_check: TranslationCheck
    method: Literal["phrase_table", "llm", "mixed"]


class DosageTranslator:
    """Translates medical instructions with phrase table lookup and preservation gate."""

    def __init__(
        self,
        phrases_path: Path | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.phrases_path = phrases_path or (self.settings.DATA_DIR / "phrases_ta.json")
        self.phrase_map: dict[str, str] = self._load_phrase_table()

    def _load_phrase_table(self) -> dict[str, str]:
        """Loads English -> Tamil translations from phrases_ta.json."""
        if not self.phrases_path.exists():
            logger.warning("phrases_ta.json not found at %s", self.phrases_path)
            return {}

        try:
            with open(self.phrases_path, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            logger.error("Failed to load phrases_ta.json: %s", e)
            return {}

        mapping: dict[str, str] = {}
        # Iterate over timing, frequency, dosage_forms, duration, instructions
        for _section, entries in data.items():
            if isinstance(entries, dict):
                for en_key, val in entries.items():
                    if isinstance(val, dict) and "text" in val:
                        mapping[en_key.lower().strip()] = val["text"].strip()
                    elif isinstance(val, str):
                        mapping[en_key.lower().strip()] = val.strip()

        return mapping

    def translate_phrase_table_only(self, text: str) -> str | None:
        """Attempts direct exact or high-coverage lookup from the phrase table."""
        norm_key = " ".join(text.lower().strip().split())
        return self.phrase_map.get(norm_key)

    async def translate(
        self,
        text: str,
        source: Literal["en", "ta"] = "en",
        target: Literal["en", "ta"] = "ta",
        protect: list[str] | None = None,
        llm_client: LLMClient | None = None,
        drug_names: list[str] | None = None,
    ) -> TranslationResult:
        """Translates source text into target language while guaranteeing entity preservation."""
        if not text.strip():
            empty_check = TranslationCheck(
                numbers_preserved=True,
                drug_names_preserved=True,
                status="ok",
            )
            return TranslationResult(text="", translation_check=empty_check, method="phrase_table")

        # Identity translation
        if source == target:
            check = check_preservation(text, text, drug_names=drug_names)
            return TranslationResult(text=text, translation_check=check, method="phrase_table")

        # 1. Direct phrase table match
        exact_match = self.translate_phrase_table_only(text)
        if exact_match:
            check = check_preservation(text, exact_match, drug_names=drug_names)
            return TranslationResult(
                text=exact_match,
                translation_check=check,
                method="phrase_table",
            )

        # 2. Multi-phrase replacement check
        # Check if text contains known dosage subphrases
        matched_subphrases = 0
        working_text = text
        # Sort phrases longest first for greedy substitution
        sorted_phrases = sorted(self.phrase_map.keys(), key=len, reverse=True)
        substitutions: list[tuple[str, str]] = []

        for p in sorted_phrases:
            pattern = rf"\b{re.escape(p)}\b"
            if re.search(pattern, working_text, flags=re.IGNORECASE):
                substitutions.append((p, self.phrase_map[p]))
                matched_subphrases += 1

        # 3. LLM Translation if free text or mixed
        if llm_client:
            system_prompt = (
                "You translate clinical prescription instructions into Tamil for an older adult. "
                "Rules:\n"
                "1. Keep all drug names in English script.\n"
                "2. Keep all numbers, units (mg, ml, etc.), and frequencies unchanged.\n"
                "3. Write natural spoken Tamil suitable for patients.\n"
                "4. Return ONLY the translated string without commentary."
            )
            user_prompt = f"Translate the following instruction into Tamil:\n{text}"

            llm_resp = await llm_client.generate_chat(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=system_prompt,
                json_mode=False,
                temperature=0.0,
                max_tokens=256,
            )
            translated_text = llm_resp.content.strip()
            method: Literal["phrase_table", "llm", "mixed"] = (
                "mixed" if matched_subphrases > 0 else "llm"
            )
        else:
            # Fallback when LLM client is not provided: apply phrase substitutions
            translated_text = working_text
            for en_sub, ta_sub in substitutions:
                pattern = rf"\b{re.escape(en_sub)}\b"
                translated_text = re.sub(
                    pattern,
                    ta_sub,
                    translated_text,
                    flags=re.IGNORECASE,
                )
            method = "mixed" if matched_subphrases > 0 else "phrase_table"

        # 4. Mandatory safety preservation check
        check = check_preservation(text, translated_text, drug_names=drug_names)
        return TranslationResult(
            text=translated_text,
            translation_check=check,
            method=method,
        )
