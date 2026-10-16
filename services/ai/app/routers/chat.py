"""Chat endpoint for CareBridge AI.

Implements CH-1 through CH-8 per docs/safety.md and docs/api-contract.md:
- POST /v1/chat: Takes messages + caller-authorized documents.
- Red-flag router runs first:
  - Emergency symptoms and self-harm immediately trigger L3 and skip LLM inference.
  - Clinical judgment questions (dose adjustments, interactions) trigger L2.
- Grounded RAG retrieval over provided documents (+ reference set).
- Grounding gate removes uncited sentences and flags support_status.
- Streaming via POST /v1/chat/stream.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import Settings, get_settings
from app.core.llm import LLMClient
from app.core.rag import (
    BaseEmbedder,
    DocumentChunk,
    SentenceTransformerEmbedder,
    chunk_document,
    load_reference_chunks,
    retrieve_top_k,
)
from app.core.safety import (
    GroundingGate,
    RedFlagMatch,
    RedFlagRouter,
    TemplatedRefusals,
    check_preservation,
    get_redflag_router,
)
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    Citation,
    SupportStatus,
    TranslationCheck,
)
from app.schemas.common import Escalation, Metrics

logger = logging.getLogger("carebridge.ai.chat")

router = APIRouter(prefix="/v1/chat", tags=["Chat"])


# Pluggable dependency injection helpers
def get_llm_client(settings: Settings = Depends(get_settings)) -> LLMClient:
    return LLMClient(settings)


def get_embedder(settings: Settings = Depends(get_settings)) -> BaseEmbedder:
    return SentenceTransformerEmbedder()


def get_safety_router() -> RedFlagRouter:
    return get_redflag_router()


def _load_fixture(settings: Settings, filename: str) -> dict[str, Any]:
    fixture_path = settings.FIXTURES_DIR / filename
    if not fixture_path.exists():
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "internal_error", "message": f"Fixture {filename} missing"}},
        )
    with open(fixture_path, encoding="utf-8") as f:
        return json.load(f)


def _build_l3_emergency_response(
    req_id: str,
    language: str,
    match: RedFlagMatch,
    settings: Settings,
    latency_ms: float,
) -> ChatResponse:
    """Builds an L3 response immediately skipping LLM inference."""
    is_crisis = match.category == "self_harm"
    if is_crisis:
        answer = TemplatedRefusals.crisis(language, settings)
        actions = TemplatedRefusals.get_crisis_actions(settings)
    else:
        answer = TemplatedRefusals.emergency(language, settings)
        actions = TemplatedRefusals.get_emergency_actions(settings)

    return ChatResponse(
        request_id=req_id,
        language="ta" if language == "ta" else "en",
        answer=answer,
        citations=[],
        support_status="unsupported",
        escalation=Escalation(
            required=True,
            level="L3",
            reason=match.reason,
            suggested_contact=match.suggested_contact,
        ),
        uncertainty_notes=["LLM skipped due to red-flag safety trigger L3."],
        suggested_actions=actions,
        translation_check=None,
        metrics=Metrics(
            latency_ms=latency_ms,
            model="rule_engine:redflag_router",
            tokens_in=0,
            tokens_out=0,
            gpu="none",
        ),
    )


async def execute_chat_pipeline(
    body: ChatRequest,
    req_id: str,
    settings: Settings,
    llm_client: LLMClient,
    embedder: BaseEmbedder,
    safety_router: RedFlagRouter,
) -> ChatResponse:
    """Core chat workflow coordinating safety, RAG, LLM inference, and the grounding gate."""
    t0 = time.perf_counter()
    user_query = body.messages[-1].content if body.messages else ""
    language = "ta" if body.language == "ta" else "en"

    # 1. Deterministic Red-Flag Safety Router
    red_flag = safety_router.check(user_query)
    if red_flag.skips_llm:
        latency_ms = (time.perf_counter() - t0) * 1000.0
        return _build_l3_emergency_response(req_id, language, red_flag, settings, latency_ms)

    # 2. Document Chunking
    all_chunks: list[DocumentChunk] = []
    chunk_idx = 1
    for doc in body.documents:
        chunks = chunk_document(doc, starting_idx=chunk_idx)
        all_chunks.extend(chunks)
        chunk_idx += len(chunks)

    if body.use_reference:
        ref_chunks = load_reference_chunks(settings, starting_idx=chunk_idx)
        all_chunks.extend(ref_chunks)

    # If question has no documents to search over
    if not all_chunks:
        latency_ms = (time.perf_counter() - t0) * 1000.0
        return ChatResponse(
            request_id=req_id,
            language=language,
            answer=TemplatedRefusals.ungrounded(language),
            citations=[],
            support_status="unsupported",
            escalation=Escalation(
                required=red_flag.level in ("L1", "L2"),
                level=red_flag.level,
                reason=red_flag.reason,
                suggested_contact=red_flag.suggested_contact,
            ),
            uncertainty_notes=["No caller documents provided to ground an answer."],
            suggested_actions=[],
            translation_check=None,
            metrics=Metrics(
                latency_ms=latency_ms,
                model="carebridge:refusal",
                tokens_in=0,
                tokens_out=0,
                gpu="none",
            ),
        )

    # 3. Dense Retrieval
    retrieved = await retrieve_top_k(user_query, all_chunks, embedder, top_k=5)
    available_citations: dict[str, Citation] = {}
    context_blocks: list[str] = []

    for i, (chunk, _score) in enumerate(retrieved, start=1):
        cid = f"c{i}"
        citation = Citation(
            id=cid,
            doc_id=chunk.doc_id,
            ref_id=chunk.ref_id,
            line_ids=chunk.line_ids,
            quote=chunk.text,
        )
        available_citations[cid] = citation
        if chunk.chunk_id:
            available_citations[chunk.chunk_id] = citation

        if chunk.ref_id:
            context_blocks.append(f'<reference id="{cid}">\n{chunk.text}\n</reference>')
        else:
            context_blocks.append(f'<document id="{cid}">\n{chunk.text}\n</document>')

    # 4. Special clinical judgment refusal (L2) with context explanation
    if red_flag.level == "L2":
        latency_ms = (time.perf_counter() - t0) * 1000.0
        # Quote relevant medicines if found in prescription chunks
        med_quotes: list[Citation] = []
        for c in available_citations.values():
            if c.doc_id and ("Medicine:" in c.quote or "Tab" in c.quote):
                med_quotes.append(c)

        if med_quotes:
            c1 = med_quotes[0]
            answer = (
                f"I cannot advise you on changing or stopping your medication. "
                f"Your record lists: {c1.quote} [{c1.id}]. "
                f"Please consult your prescribing doctor or pharmacist before making any changes."
            )
            citations = [c1]
            support_status: SupportStatus = "partial"
        else:
            answer = TemplatedRefusals.clinical_refusal(language, red_flag.reason)
            citations = []
            support_status = "unsupported"

        return ChatResponse(
            request_id=req_id,
            language=language,
            answer=answer,
            citations=citations,
            support_status=support_status,
            escalation=Escalation(
                required=True,
                level="L2",
                reason=red_flag.reason,
                suggested_contact=red_flag.suggested_contact,
            ),
            uncertainty_notes=[
                "Medication modification/discontinuation requests require physician review."
            ],
            suggested_actions=TemplatedRefusals.get_clinical_actions(),
            translation_check=None,
            metrics=Metrics(
                latency_ms=latency_ms,
                model="carebridge:clinical_safety",
                tokens_in=0,
                tokens_out=0,
                gpu="none",
            ),
        )

    # 5. LLM Prompt Construction
    prompt_file = settings.PROMPTS_DIR / "chat.md"
    system_prompt = prompt_file.read_text(encoding="utf-8") if prompt_file.exists() else ""

    context_str = "\n\n".join(context_blocks)
    conversation_str = "\n".join([f"{m.role}: {m.content}" for m in body.messages])
    user_prompt = (
        f"Available context blocks:\n{context_str}\n\n"
        f"Conversation:\n{conversation_str}\n\n"
        f"Answer in language '{language}'. Reply in JSON schema."
    )

    llm_resp = await llm_client.generate_chat(
        messages=[{"role": "user", "content": user_prompt}],
        system_prompt=system_prompt,
        json_mode=True,
        temperature=0.1,
        max_tokens=1024,
    )

    # 6. Parse and Grounding Gate Verification
    parsed = llm_resp.parsed_json or {}
    sentences = parsed.get("sentences", [])
    if not isinstance(sentences, list):
        sentences = []

    kept_sentences, support_status, uncertainty_notes = GroundingGate.verify(
        sentences, available_citations
    )

    final_citations: list[Citation] = []
    used_citation_ids: set[str] = set()

    if support_status == "unsupported" or not kept_sentences:
        answer_text = TemplatedRefusals.ungrounded(language)
        final_citations = []
    else:
        # Build answer text with citation markers
        formatted_sentences: list[str] = []
        for s in kept_sentences:
            stext = s.get("text", "").strip()
            cids = s.get("citation_ids", [])
            for cid in cids:
                used_citation_ids.add(cid)
            markers = " ".join([f"[{cid}]" for cid in cids])
            formatted_sentences.append(f"{stext} {markers}".strip())

        answer_text = " ".join(formatted_sentences)
        final_citations = [
            available_citations[cid]
            for cid in used_citation_ids
            if cid in available_citations
        ]

    # Escalation determination
    needs_clinician = bool(parsed.get("needs_clinician", False))
    level = "L1" if (red_flag.level == "L1" or needs_clinician) else "L0"
    escalation = Escalation(
        required=level != "L0",
        level=level,
        reason=parsed.get("reason") or red_flag.reason,
        suggested_contact="pharmacist" if level == "L1" else "none",
    )

    # Translation check for Tamil
    translation_check: TranslationCheck | None = None
    if language == "ta":
        source_sample = " ".join([c.quote for c in final_citations]) if final_citations else ""
        translation_check = check_preservation(source_sample, answer_text)

    latency_ms = (time.perf_counter() - t0) * 1000.0
    metrics = Metrics(
        latency_ms=latency_ms,
        model=llm_resp.metrics.model,
        tokens_in=llm_resp.metrics.tokens_in,
        tokens_out=llm_resp.metrics.tokens_out,
        gpu=llm_resp.metrics.gpu,
    )

    return ChatResponse(
        request_id=req_id,
        language=language,
        answer=answer_text,
        citations=final_citations,
        support_status=support_status,
        escalation=escalation,
        uncertainty_notes=uncertainty_notes,
        suggested_actions=[],
        translation_check=translation_check,
        metrics=metrics,
    )


@router.post("", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    settings: Settings = Depends(get_settings),
    llm_client: LLMClient = Depends(get_llm_client),
    embedder: BaseEmbedder = Depends(get_embedder),
    safety_router: RedFlagRouter = Depends(get_safety_router),
) -> ChatResponse:
    """Stateless chat endpoint with red-flag gating and grounding verification."""
    req_id = getattr(request.state, "request_id", "req-chat")

    # Safety first: red-flag check runs immediately on incoming query
    last_msg = body.messages[-1].content if body.messages else ""
    red_flag = safety_router.check(last_msg)
    if red_flag.skips_llm:
        return _build_l3_emergency_response(req_id, body.language, red_flag, settings, 12.0)

    # If MOCK_MODE is enabled AND dependencies are standard production instances
    if settings.MOCK_MODE and isinstance(llm_client, LLMClient):
        # Clinical refusal fixture
        if red_flag.level == "L2":
            data = _load_fixture(settings, "chat_refusal.json")
            data["request_id"] = req_id
            return ChatResponse.model_validate(data)

        # Default supported fixture
        data = _load_fixture(settings, "chat_supported.json")
        data["request_id"] = req_id
        if body.language in ("en", "ta"):
            data["language"] = body.language
        return ChatResponse.model_validate(data)

    # Execute live RAG + LLM + Grounding Gate pipeline
    return await execute_chat_pipeline(
        body=body,
        req_id=req_id,
        settings=settings,
        llm_client=llm_client,
        embedder=embedder,
        safety_router=safety_router,
    )


@router.post("/stream")
async def chat_stream(
    request: Request,
    body: ChatRequest,
    settings: Settings = Depends(get_settings),
    llm_client: LLMClient = Depends(get_llm_client),
    embedder: BaseEmbedder = Depends(get_embedder),
    safety_router: RedFlagRouter = Depends(get_safety_router),
):
    """Server-Sent Events streaming chat endpoint. L3 emergency sends 'done' immediately."""
    req_id = getattr(request.state, "request_id", "req-chat-stream")

    # Safety first: check for L3 emergency
    last_msg = body.messages[-1].content if body.messages else ""
    red_flag = safety_router.check(last_msg)
    if red_flag.skips_llm:
        l3_resp = _build_l3_emergency_response(req_id, body.language, red_flag, settings, 12.0)

        async def immediate_done():
            yield f"event: done\ndata: {l3_resp.model_dump_json()}\n\n"

        return StreamingResponse(
            immediate_done(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Request-ID": req_id},
        )

    # Resolve full ChatResponse (either via mock fixture or live pipeline)
    if settings.MOCK_MODE and isinstance(llm_client, LLMClient):
        if red_flag.level == "L2":
            data = _load_fixture(settings, "chat_refusal.json")
        else:
            data = _load_fixture(settings, "chat_supported.json")
        data["request_id"] = req_id
        if body.language in ("en", "ta"):
            data["language"] = body.language
        chat_response = ChatResponse.model_validate(data)
    else:
        chat_response = await execute_chat_pipeline(
            body=body,
            req_id=req_id,
            settings=settings,
            llm_client=llm_client,
            embedder=embedder,
            safety_router=safety_router,
        )

    async def event_generator():
        words = chat_response.answer.split(" ")
        for word in words:
            yield f"event: token\ndata: {json.dumps({'token': word + ' '})}\n\n"
            await asyncio.sleep(0.03)

        yield f"event: done\ndata: {chat_response.model_dump_json()}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Request-ID": req_id},
    )
