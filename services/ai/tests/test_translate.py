"""Unit and integration tests for dosage phrase translation and preservation checking.

Verifies:
- data/phrases_ta.json structure and needs_native_review flag on all Tamil values.
- Phrase table exact and composite lookup.
- Preservation checking for numbers and drug names.
- POST /v1/translate endpoint behavior.
"""

from __future__ import annotations

import json
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.core.translate import DosageTranslator
from app.main import app
from app.routers.translate import get_dosage_translator, get_llm_client
from tests.fakes import FakeLLM


@pytest.fixture
def translator() -> DosageTranslator:
    return DosageTranslator()


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def client(
    translator: DosageTranslator, fake_llm: FakeLLM
) -> Generator[TestClient, None, None]:
    def get_test_settings() -> Settings:
        return Settings(MOCK_MODE=False)

    app.dependency_overrides[get_settings] = get_test_settings
    app.dependency_overrides[get_dosage_translator] = lambda: translator
    app.dependency_overrides[get_llm_client] = lambda: fake_llm

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


class TestPhrasesTamilCatalog:
    def test_phrases_ta_json_all_tamil_marked_needs_native_review(
        self, translator: DosageTranslator
    ) -> None:
        """Rule: Every Tamil value in phrases_ta.json must have needs_native_review: true."""
        assert translator.phrases_path.exists()

        with open(translator.phrases_path, encoding="utf-8") as f:
            data = json.load(f)

        sections = ["timing", "frequency", "dosage_forms", "duration", "instructions"]
        total_phrases = 0
        for sec in sections:
            assert sec in data, f"Missing section '{sec}' in phrases_ta.json"
            section_items = data[sec]
            assert len(section_items) > 0, f"Section '{sec}' must not be empty"

            for en_key, val in section_items.items():
                total_phrases += 1
                assert isinstance(val, dict), f"Entry '{en_key}' in '{sec}' must be a dict"
                assert "text" in val, f"Entry '{en_key}' missing 'text' translation"
                assert val.get("needs_native_review") is True, (
                    f"Entry '{en_key}' in '{sec}' must have needs_native_review: true"
                )

        assert total_phrases >= 30, f"Expected comprehensive catalog, found {total_phrases} phrases"


class TestDosageTranslator:
    @pytest.mark.asyncio
    async def test_exact_phrase_lookup_returns_phrase_table(
        self, translator: DosageTranslator
    ) -> None:
        """Exact matches in the phrase catalog return method='phrase_table'."""
        result = await translator.translate("after food", source="en", target="ta")
        assert result.method == "phrase_table"
        assert result.text == "உணவுக்குப் பின்"
        assert result.translation_check.status == "ok"

    @pytest.mark.asyncio
    async def test_composite_instruction_returns_mixed(
        self, translator: DosageTranslator
    ) -> None:
        """Multi-phrase instruction without LLM returns mixed substitution."""
        source = "Take 1 tablet after food for 7 days"
        result = await translator.translate(source, source="en", target="ta", llm_client=None)
        assert result.method == "mixed"
        assert "உணவுக்குப் பின்" in result.text
        assert "7 நாட்களுக்கு" in result.text
        # Numbers 1 and 7 should be preserved
        assert result.translation_check.numbers_preserved is True

    @pytest.mark.asyncio
    async def test_number_preservation_failure_flagged(
        self, translator: DosageTranslator, fake_llm: FakeLLM
    ) -> None:
        """If an LLM drops a dosage number, translation_check must flag uncertain_translation."""
        fake_llm.default_text = "உணவுக்குப் பின் மாத்திரை உட்கொள்ளவும்"  # dropped 500mg and 30 days
        result = await translator.translate(
            "Take 500mg twice daily for 30 days",
            source="en",
            target="ta",
            llm_client=fake_llm,
        )
        assert result.translation_check.numbers_preserved is False
        assert result.translation_check.status == "uncertain_translation"


class TestTranslateRouter:
    def test_post_translate_exact_phrase(self, client: TestClient) -> None:
        """POST /v1/translate with phrase table match."""
        resp = client.post(
            "/v1/translate",
            json={"text": "before food", "source": "en", "target": "ta"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["method"] == "phrase_table"
        assert "உணவுக்கு முன்" in data["text"]
        assert data["translation_check"]["status"] == "ok"

    def test_post_translate_llm_assisted(
        self, client: TestClient, fake_llm: FakeLLM
    ) -> None:
        """POST /v1/translate with free text explanation preserving numbers and drugs."""
        fake_llm.default_text = "Metformin 500mg மாத்திரையை உணவுக்குப் பின் 30 நாட்களுக்கு எடுக்கவும்"
        resp = client.post(
            "/v1/translate",
            json={
                "text": "Please take Metformin 500mg after food for 30 days.",
                "source": "en",
                "target": "ta",
                "protect": ["drug names", "numbers"],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["method"] in ("llm", "mixed")
        assert data["translation_check"]["numbers_preserved"] is True
        assert data["translation_check"]["drug_names_preserved"] is True
        assert data["translation_check"]["status"] == "ok"
