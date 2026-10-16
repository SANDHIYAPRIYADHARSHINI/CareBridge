from app.core.extraction import extract_prescription
from app.core.frequency import normalize_frequency
from app.core.llm import LLMClient, LLMResponse, encode_image_base64
from app.core.ocr import (
    compute_ocr_statistics,
    deskew_image,
    extract_ocr_lines,
    find_tesseract_binary,
    is_tamil_text,
    validate_tesseract,
)
from app.core.rag import (
    BaseEmbedder,
    DocumentChunk,
    SentenceTransformerEmbedder,
    chunk_document,
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
from app.core.stt import BaseSTT, STTResult, WhisperSTT
from app.core.translate import DosageTranslator, TranslationResult
from app.core.verification import apply_evidence_gate, verify_prescription_rules

__all__ = [
    "LLMClient",
    "LLMResponse",
    "encode_image_base64",
    "extract_ocr_lines",
    "deskew_image",
    "is_tamil_text",
    "find_tesseract_binary",
    "validate_tesseract",
    "compute_ocr_statistics",
    "normalize_frequency",
    "apply_evidence_gate",
    "verify_prescription_rules",
    "extract_prescription",
    "RedFlagRouter",
    "RedFlagMatch",
    "GroundingGate",
    "TemplatedRefusals",
    "check_preservation",
    "get_redflag_router",
    "BaseEmbedder",
    "SentenceTransformerEmbedder",
    "DocumentChunk",
    "chunk_document",
    "retrieve_top_k",
    "BaseSTT",
    "WhisperSTT",
    "STTResult",
    "DosageTranslator",
    "TranslationResult",
]
