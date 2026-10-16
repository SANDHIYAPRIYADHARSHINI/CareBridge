"""Unit tests for CareBridge AI RAG retrieval engine.

Verifies:
- Document chunking over OCR lines, structured prescription data, and plain text.
- Reference formulary chunking.
- Dense retrieval with pluggable FakeEmbedder interface.
- Provenance preservation (doc_id and line_ids).
"""

from __future__ import annotations

import pytest

from app.core.rag import (
    chunk_document,
    load_reference_chunks,
    retrieve_top_k,
)
from app.schemas.chat import ChatDocument
from app.schemas.common import OcrLine
from tests.fakes import FakeEmbedder


class TestRAGChunkingAndRetrieval:
    @pytest.fixture
    def sample_document(self) -> ChatDocument:
        return ChatDocument(
            doc_id="doc-test-rx-001",
            type="prescription",
            title="Dr. Ramanathan Clinic Prescription",
            structured={
                "hospital": "City Community Hospital",
                "prescriber": "Dr. S. Ramanathan",
                "date": "2026-10-15",
                "medicines": [
                    {
                        "name": "Metformin",
                        "dose": "500mg",
                        "frequency": "1-0-1",
                        "timing": "after food",
                        "duration": "30 days",
                    },
                    {
                        "name": "Atorvastatin",
                        "dose": "10mg",
                        "frequency": "0-0-1",
                        "timing": "night",
                        "duration": "30 days",
                    },
                ],
            },
            ocr_lines=[
                OcrLine(
                    id="L1",
                    text="Dr. S. Ramanathan MBBS, MD",
                    bbox=[50, 50, 400, 30],
                    page=1,
                    conf=0.98,
                ),
                OcrLine(
                    id="L2",
                    text="1. Tab Metformin 500mg - 1-0-1 after food x 30 days",
                    bbox=[60, 150, 600, 30],
                    page=1,
                    conf=0.95,
                ),
                OcrLine(
                    id="L3",
                    text="2. Tab Atorvastatin 10mg - 0-0-1 night after food x 30 days",
                    bbox=[60, 200, 600, 30],
                    page=1,
                    conf=0.94,
                ),
            ],
            text=None,
        )

    def test_chunking_preserves_provenance(self, sample_document: ChatDocument) -> None:
        chunks = chunk_document(sample_document)
        assert len(chunks) > 0

        # Check OCR lines chunked with line_ids
        ocr_chunks = [c for c in chunks if c.metadata.get("source") == "ocr_line"]
        assert len(ocr_chunks) == 3
        assert ocr_chunks[0].line_ids == ["L1"]
        assert ocr_chunks[0].doc_id == "doc-test-rx-001"
        assert "Ramanathan" in ocr_chunks[0].text

        # Check structured medicine chunks
        med_chunks = [c for c in chunks if c.metadata.get("source") == "structured_medicine"]
        assert len(med_chunks) == 2
        assert "Metformin" in med_chunks[0].text
        assert "Atorvastatin" in med_chunks[1].text

    def test_load_reference_chunks(self) -> None:
        ref_chunks = load_reference_chunks()
        assert len(ref_chunks) > 0
        first = ref_chunks[0]
        assert first.ref_id is not None
        assert first.doc_id is None
        assert "Reference Drug:" in first.text

    @pytest.mark.asyncio
    async def test_dense_retrieval_with_fake_embedder(
        self, sample_document: ChatDocument
    ) -> None:
        chunks = chunk_document(sample_document)
        embedder = FakeEmbedder()

        # Query specifically for cholesterol / Atorvastatin
        results = await retrieve_top_k("Atorvastatin night dose", chunks, embedder, top_k=2)

        assert len(results) == 2
        top_chunk, top_score = results[0]
        assert "Atorvastatin" in top_chunk.text
        assert top_score > 0.0
