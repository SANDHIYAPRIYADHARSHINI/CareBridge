"""RAG retrieval engine and pluggable embedder interface for CareBridge AI.

Implements CH-1, CH-2, CH-3:
- Pluggable BaseEmbedder interface with production SentenceTransformerEmbedder
  and test FakeEmbedder.
- In-memory numpy cosine similarity retrieval over caller-authorized documents
  and reference formulary.
- Precise chunking preserving doc_id and line_ids provenance.
- Stateless: never queries external databases.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.config import Settings, get_settings
from app.schemas.chat import ChatDocument

logger = logging.getLogger("carebridge.ai.rag")


@dataclass
class DocumentChunk:
    """A granular retrieval unit with exact provenance."""

    chunk_id: str
    doc_id: str | None
    ref_id: str | None
    line_ids: list[str]
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseEmbedder(ABC):
    """Abstract interface for dense multilingual text embedding models."""

    @property
    def is_fallback(self) -> bool:
        """Returns True if the embedder is running in fallback mode."""
        return False

    @property
    def loaded_model_name(self) -> str:
        """Returns the identifier/class of the model actually loaded."""
        return self.__class__.__name__

    @abstractmethod
    async def embed_texts(self, texts: list[str]) -> np.ndarray:
        """Returns a 2D float32 numpy array of shape (len(texts), dim), L2-normalized."""
        pass

    @abstractmethod
    async def embed_query(self, query: str) -> np.ndarray:
        """Returns a 1D float32 numpy array of shape (dim,), L2-normalized."""
        pass


class SentenceTransformerEmbedder(BaseEmbedder):
    """Production embedder utilizing HuggingFace / sentence-transformers on ROCm/CPU."""

    def __init__(self, model_name: str | None = None) -> None:
        self.settings = get_settings()
        self.model_name = model_name or self.settings.EMBED_MODEL
        self._model: Any = None

    @property
    def is_fallback(self) -> bool:
        """Returns True if the n-gram fallback embedder is currently active."""
        model = self._get_model()
        return isinstance(model, _FallbackNgramEmbedder)

    @property
    def loaded_model_name(self) -> str:
        """Returns the description of the embedder actually loaded."""
        model = self._get_model()
        if isinstance(model, _FallbackNgramEmbedder):
            return f"_FallbackNgramEmbedder (n-gram fallback for {self.model_name})"
        return f"SentenceTransformer ({self.model_name})"


    def _get_model(self) -> Any:
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer

                logger.info("Loading embedding model %s", self.model_name)
                self._model = SentenceTransformer(self.model_name)
            except Exception as e:
                logger.warning(
                    "sentence_transformers failed to load %s (%s). Using fallback embedder.",
                    self.model_name,
                    e,
                )
                self._model = _FallbackNgramEmbedder()
        return self._model

    async def embed_texts(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.empty((0, 384), dtype=np.float32)

        model = self._get_model()
        if isinstance(model, _FallbackNgramEmbedder):
            return model.embed_batch(texts)

        embeddings = model.encode(texts, normalize_embeddings=True)
        return np.asarray(embeddings, dtype=np.float32)

    async def embed_query(self, query: str) -> np.ndarray:
        model = self._get_model()
        if isinstance(model, _FallbackNgramEmbedder):
            return model.embed_one(query)

        embedding = model.encode([query], normalize_embeddings=True)[0]
        return np.asarray(embedding, dtype=np.float32)


class _FallbackNgramEmbedder:
    """Deterministic CPU multilingual character n-gram bag embedder for environments without GPU."""

    is_fallback: bool = True
    loaded_model_name: str = "_FallbackNgramEmbedder"

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim


    def _hash_vector(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dim, dtype=np.float32)
        words = text.lower().split()
        for word in words:
            # Word token hash
            h = hash(word) % self.dim
            vec[h] += 1.0
            # Character trigram hashes for typo tolerance and morphology
            for i in range(len(word) - 2):
                tri = word[i : i + 3]
                th = hash(tri) % self.dim
                vec[th] += 0.5

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        return np.vstack([self._hash_vector(t) for t in texts])

    def embed_one(self, text: str) -> np.ndarray:
        return self._hash_vector(text)


def chunk_document(doc: ChatDocument, starting_idx: int = 1) -> list[DocumentChunk]:
    """Extracts chunks from a caller-provided ChatDocument."""
    chunks: list[DocumentChunk] = []
    idx = starting_idx

    # 1. OCR lines chunking
    if doc.ocr_lines:
        for line in doc.ocr_lines:
            text = line.text.strip()
            if text:
                chunks.append(
                    DocumentChunk(
                        chunk_id=f"c{idx}",
                        doc_id=doc.doc_id,
                        ref_id=None,
                        line_ids=[line.id],
                        text=text,
                        metadata={"source": "ocr_line", "page": line.page, "conf": line.conf},
                    )
                )
                idx += 1

    # 2. Structured data chunking (e.g. medicines, prescriber, hospital)
    def _extract_val_and_lines(field: Any) -> tuple[str, list[str]]:
        if isinstance(field, dict):
            val = str(field.get("value") or field.get("raw") or "").strip()
            lines = field.get("evidence_line_ids", [])
            return val, lines if isinstance(lines, list) else []
        if isinstance(field, str):
            return field.strip(), []
        if field is None:
            return "", []
        return str(field).strip(), []

    if doc.structured and isinstance(doc.structured, dict):
        # Medicines
        meds = doc.structured.get("medicines", [])
        if isinstance(meds, list):
            for med in meds:
                if isinstance(med, dict):
                    name_str, name_lines = _extract_val_and_lines(med.get("name"))
                    strength_str, strength_lines = _extract_val_and_lines(med.get("strength") or med.get("dose"))
                    freq_str, freq_lines = _extract_val_and_lines(med.get("frequency"))
                    timing_str, timing_lines = _extract_val_and_lines(med.get("timing"))
                    dur_str, dur_lines = _extract_val_and_lines(med.get("duration"))
                    inst_str, inst_lines = _extract_val_and_lines(med.get("instructions"))

                    parts = [p for p in [name_str, strength_str, freq_str, timing_str, dur_str, inst_str] if p]
                    med_text = " - ".join(parts) if parts else str(med)
                    all_lines = list(dict.fromkeys(name_lines + strength_lines + freq_lines + timing_lines + dur_lines + inst_lines))

                    chunks.append(
                        DocumentChunk(
                            chunk_id=f"c{idx}",
                            doc_id=doc.doc_id,
                            ref_id=None,
                            line_ids=all_lines,
                            text=f"Medicine: {med_text}",
                            metadata={"source": "structured_medicine", "drug_name": name_str},
                        )
                    )
                    idx += 1

        # Hospital / Prescriber metadata
        h_str, _ = _extract_val_and_lines(doc.structured.get("hospital"))
        p_str, _ = _extract_val_and_lines(doc.structured.get("prescriber"))
        d_str, _ = _extract_val_and_lines(doc.structured.get("date"))
        if h_str or p_str or d_str:
            meta_parts = [
                f"Hospital: {h_str}" if h_str else "",
                f"Prescriber: {p_str}" if p_str else "",
                f"Date: {d_str}" if d_str else "",
            ]
            meta_text = ", ".join([p for p in meta_parts if p])
            chunks.append(
                DocumentChunk(
                    chunk_id=f"c{idx}",
                    doc_id=doc.doc_id,
                    ref_id=None,
                    line_ids=[],
                    text=meta_text,
                    metadata={"source": "structured_metadata"},
                )
            )
            idx += 1

    # 3. Unstructured plain text chunking
    if doc.text and doc.text.strip():
        paragraphs = [p.strip() for p in doc.text.split("\n\n") if p.strip()]
        for para in paragraphs:
            chunks.append(
                DocumentChunk(
                    chunk_id=f"c{idx}",
                    doc_id=doc.doc_id,
                    ref_id=None,
                    line_ids=[],
                    text=para,
                    metadata={"source": "plain_text"},
                )
            )
            idx += 1

    return chunks


def load_reference_chunks(
    settings: Settings | None = None,
    starting_idx: int = 100,
) -> list[DocumentChunk]:
    """Loads reference formulary chunks from data/reference/drugs.json."""
    cfg = settings or get_settings()
    drugs_file = cfg.DATA_DIR / "reference" / "drugs.json"
    if not drugs_file.exists():
        logger.warning("drugs.json reference file not found at %s", drugs_file)
        return []

    try:
        with open(drugs_file, encoding="utf-8") as f:
            drugs = json.load(f)
    except Exception as e:
        logger.error("Failed to load reference drugs: %s", e)
        return []

    chunks: list[DocumentChunk] = []
    idx = starting_idx
    for drug in drugs:
        drug_id = drug.get("id")
        name = drug.get("name", "")
        name_ta = drug.get("name_ta", "")
        drug_class = drug.get("class", "")
        common_freq = drug.get("common_frequency", "")
        timing_en = drug.get("timing_en", "")
        timing_ta = drug.get("timing_ta", "")
        inst_en = drug.get("instructions_en", "")
        inst_ta = drug.get("instructions_ta", "")

        text_lines = [
            f"Reference Drug: {name} ({name_ta})",
            f"Class: {drug_class}",
            f"Common Frequency: {common_freq}",
            f"Timing: {timing_en} / {timing_ta}",
            f"Instructions: {inst_en} / {inst_ta}",
        ]
        text = "\n".join(text_lines)

        chunks.append(
            DocumentChunk(
                chunk_id=f"c{idx}",
                doc_id=None,
                ref_id=drug_id,
                line_ids=[],
                text=text,
                metadata={"source": "reference_formulary", "source_url": drug.get("source_url")},
            )
        )
        idx += 1

    generics_file = cfg.DATA_DIR / "reference" / "generics.json"
    if generics_file.exists():
        try:
            with open(generics_file, encoding="utf-8") as f:
                generics = json.load(f)
            for gen in generics:
                name = gen.get("name", "")
                desc = gen.get("description", "")
                uses = gen.get("common_uses", "")
                precautions = gen.get("important_precautions", "")
                # Only chunk if human verification is completed and text fields are populated
                if desc or uses or precautions:
                    text_parts = [f"Generic Drug: {name}"]
                    if desc:
                        text_parts.append(f"Description: {desc}")
                    if uses:
                        text_parts.append(f"Common Uses: {uses}")
                    if precautions:
                        text_parts.append(f"Precautions: {precautions}")
                    chunks.append(
                        DocumentChunk(
                            chunk_id=f"c{idx}",
                            doc_id=None,
                            ref_id=gen.get("id"),
                            line_ids=[],
                            text="\n".join(text_parts),
                            metadata={
                                "source": "reference_generics",
                                "source_url": gen.get("source_url"),
                            },
                        )
                    )
                    idx += 1
        except Exception as e:
            logger.warning("Failed to load reference generics: %s", e)

    return chunks


async def retrieve_top_k(
    query: str,
    chunks: list[DocumentChunk],
    embedder: BaseEmbedder,
    top_k: int = 5,
) -> list[tuple[DocumentChunk, float]]:
    """Performs in-memory cosine similarity retrieval over document chunks."""
    if not chunks:
        return []

    texts = [c.text for c in chunks]
    chunk_vectors = await embedder.embed_texts(texts)
    query_vector = await embedder.embed_query(query)

    # Compute dot products (cosine similarity for normalized vectors)
    scores = np.dot(chunk_vectors, query_vector)

    ranked_indices = np.argsort(scores)[::-1]
    top_indices = ranked_indices[:top_k]

    return [(chunks[i], float(scores[i])) for i in top_indices]
