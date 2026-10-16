"""Document summarization endpoint with Grounding Gate and entity verification.

Implements SU-1 through SU-5 per docs/safety.md and docs/api-contract.md:
- POST /v1/summaries
- Provenance chunking over caller-provided documents.
- Plain-language summary sentences with citation IDs.
- Extraction of missing clinical items and contradictory inconsistencies.
- Strict reuse of GroundingGate to remove uncited claims.
- Optional Tamil number and drug-name preservation verification.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings
from app.core.llm import LLMClient
from app.core.rag import chunk_document
from app.core.safety import GroundingGate, check_preservation
from app.schemas.chat import ChatDocument, Citation
from app.schemas.common import Metrics
from app.schemas.summary import SummaryRequest, SummaryResponse, SummarySentence

router = APIRouter(prefix="/v1/summaries", tags=["Summaries"])


def get_llm_client(settings: Settings = Depends(get_settings)) -> LLMClient:
    return LLMClient(settings)


@router.post("", response_model=SummaryResponse)
async def create_summary(
    request: Request,
    body: SummaryRequest,
    settings: Settings = Depends(get_settings),
    llm_client: LLMClient = Depends(get_llm_client),
) -> SummaryResponse:
    """Generates grounded clinical document summaries with citations and missing/conflict flags."""
    t0 = time.perf_counter()
    doc = body.document
    doc_id = doc.doc_id
    language = body.language

    # Mock mode with default production LLM client
    if settings.MOCK_MODE and isinstance(llm_client, LLMClient):
        sentences = [
            SummarySentence(
                text=(
                    "The prescription prescribes three daily medications for blood sugar, "
                    "cholesterol, and blood pressure control."
                ),
                citation_ids=["c1"],
            ),
            SummarySentence(
                text=(
                    "Follow-up consultation is scheduled in 4 weeks with fasting blood sugar "
                    "and lipid profile tests."
                ),
                citation_ids=["c2"],
            ),
        ]
        citations = [
            Citation(
                id="c1",
                doc_id=doc_id,
                quote="Tab Metformin 500mg, Tab Atorvastatin 10mg, Tab Amlodipine 5mg",
            ),
            Citation(
                id="c2",
                doc_id=doc_id,
                quote="Follow up in 4 weeks with fasting blood sugar and lipid profile",
            ),
        ]
        return SummaryResponse(
            summary_sentences=sentences,
            missing=[],
            inconsistencies=[],
            citations=citations,
            reading_level=7.5,
            metrics=Metrics(
                latency_ms=290.0,
                model=settings.LLM_MODEL,
                tokens_in=500,
                tokens_out=90,
                gpu="AMD Instinct MI300X",
            ),
        )

    # 1. Chunk document to generate valid citations
    chat_doc = ChatDocument(
        doc_id=doc.doc_id,
        type=doc.type if doc.type in ("prescription", "discharge", "report") else "prescription",
        title=f"Document {doc.doc_id}",
        structured=doc.structured,
        ocr_lines=doc.ocr_lines,
        text=doc.text,
    )
    chunks = chunk_document(chat_doc, starting_idx=1)

    available_citations: dict[str, Citation] = {}
    context_blocks: list[str] = []
    for chunk in chunks:
        citation = Citation(
            id=chunk.chunk_id,
            doc_id=chunk.doc_id,
            ref_id=chunk.ref_id,
            line_ids=chunk.line_ids,
            quote=chunk.text,
        )
        available_citations[chunk.chunk_id] = citation
        context_blocks.append(f'<document id="{chunk.chunk_id}">\n{chunk.text}\n</document>')

    if not chunks:
        latency_ms = (time.perf_counter() - t0) * 1000.0
        return SummaryResponse(
            summary_sentences=[],
            missing=["No document content or readable text was provided."],
            inconsistencies=[],
            citations=[],
            reading_level=None,
            translation_check=None,
            metrics=Metrics(
                latency_ms=latency_ms,
                model="carebridge:empty",
                tokens_in=0,
                tokens_out=0,
                gpu="none",
            ),
        )

    # 2. LLM Prompt Construction
    prompt_file = settings.PROMPTS_DIR / "summary.md"
    system_prompt = (
        prompt_file.read_text(encoding="utf-8")
        if prompt_file.exists()
        else (
            "Summarize the document for a patient in plain language, at most 8 short sentences. "
            "Each sentence needs citation ids. Then list missing and inconsistencies."
        )
    )

    context_str = "\n\n".join(context_blocks)
    user_prompt = (
        f"Document context:\n{context_str}\n\n"
        f"Language: '{language}'. Provide output in JSON schema:\n"
        '{"sentences":[{"text":"...","citation_ids":["c1"]}],'
        '"missing":[],"inconsistencies":[],"reading_level":7.0}'
    )

    llm_resp = await llm_client.generate_chat(
        messages=[{"role": "user", "content": user_prompt}],
        system_prompt=system_prompt,
        json_mode=True,
        temperature=0.1,
        max_tokens=1024,
    )

    parsed = llm_resp.parsed_json or {}
    raw_sentences = parsed.get("sentences", [])
    if not isinstance(raw_sentences, list):
        raw_sentences = []

    # 3. Grounding Gate Verification (strips uncited sentences)
    kept_sentences, _support_status, _notes = GroundingGate.verify(
        raw_sentences, available_citations
    )

    final_sentences: list[SummarySentence] = []
    used_citation_ids: set[str] = set()

    for s in kept_sentences:
        cids = s.get("citation_ids", [])
        for cid in cids:
            used_citation_ids.add(cid)
        final_sentences.append(
            SummarySentence(
                text=s.get("text", "").strip(),
                citation_ids=cids,
            )
        )

    final_citations = [
        available_citations[cid]
        for cid in used_citation_ids
        if cid in available_citations
    ]

    missing_items = parsed.get("missing", [])
    if not isinstance(missing_items, list):
        missing_items = []

    inconsistencies = parsed.get("inconsistencies", [])
    if not isinstance(inconsistencies, list):
        inconsistencies = []

    reading_level = parsed.get("reading_level")
    try:
        reading_level_float = float(reading_level) if reading_level is not None else 7.0
    except (ValueError, TypeError):
        reading_level_float = 7.0

    # 4. Tamil preservation check if target language is Tamil
    translation_check_dict: dict[str, Any] | None = None
    if language == "ta":
        source_sample = " ".join([c.quote for c in final_citations]) if final_citations else ""
        target_sample = " ".join([s.text for s in final_sentences])
        tc = check_preservation(source_sample, target_sample)
        translation_check_dict = {
            "numbers_preserved": tc.numbers_preserved,
            "drug_names_preserved": tc.drug_names_preserved,
            "status": tc.status,
        }

    latency_ms = (time.perf_counter() - t0) * 1000.0
    metrics = Metrics(
        latency_ms=latency_ms,
        model=llm_resp.metrics.model,
        tokens_in=llm_resp.metrics.tokens_in,
        tokens_out=llm_resp.metrics.tokens_out,
        gpu=llm_resp.metrics.gpu,
    )

    return SummaryResponse(
        summary_sentences=final_sentences,
        missing=missing_items,
        inconsistencies=inconsistencies,
        citations=final_citations,
        reading_level=reading_level_float,
        translation_check=translation_check_dict,
        metrics=metrics,
    )
