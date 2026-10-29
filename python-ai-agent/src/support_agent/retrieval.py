"""Small, dependency-free retrieval: markdown chunking + BM25 (default) or a pluggable
embedding retriever with cosine similarity."""

from __future__ import annotations

import hashlib
import math
import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Chunk:
    source_id: str  # "<doc-id>#<section-slug>", stable across runs
    doc_id: str
    title: str
    heading: str
    text: str

    @property
    def search_text(self) -> str:
        # Headings are short and highly informative; include them in the indexed text.
        return f"{self.title}\n{self.heading}\n{self.text}"


@dataclass(frozen=True)
class SearchHit:
    chunk: Chunk
    score: float


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "section"


def chunk_markdown(doc_id: str, markdown: str, *, max_chars: int = 900) -> list[Chunk]:
    """Split a markdown document into one chunk per section (level 2+ heading).
    The level-1 heading is the document title. Oversized sections are split on
    paragraph boundaries."""
    title = doc_id.replace("-", " ").title()
    sections: list[tuple[str, list[str]]] = []
    current_heading, current_lines = "Overview", []
    for line in markdown.splitlines():
        match = _HEADING_RE.match(line)
        if match and len(match.group(1)) == 1:
            title = match.group(2)
            continue
        if match:
            sections.append((current_heading, current_lines))
            current_heading, current_lines = match.group(2), []
            continue
        current_lines.append(line)
    sections.append((current_heading, current_lines))

    chunks: list[Chunk] = []
    used: Counter[str] = Counter()
    for heading, lines in sections:
        body = "\n".join(lines).strip()
        if not body:
            continue
        for part in _split_paragraphs(body, max_chars):
            slug = slugify(heading)
            used[slug] += 1
            suffix = "" if used[slug] == 1 else f"-{used[slug]}"
            chunks.append(Chunk(f"{doc_id}#{slug}{suffix}", doc_id, title, heading, part))
    return chunks


def _split_paragraphs(body: str, max_chars: int) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    parts: list[str] = []
    buffer = ""
    for paragraph in paragraphs:
        candidate = f"{buffer}\n\n{paragraph}" if buffer else paragraph
        if buffer and len(candidate) > max_chars:
            parts.append(buffer)
            buffer = paragraph
        else:
            buffer = candidate
    if buffer:
        parts.append(buffer)
    return parts


# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------

_STOPWORDS_TEXT = """
a an and are as at be but by can do does for from how i if in is it its my of on or
our so that the their them then there this to us was we what when where which who
will with you your
"""
STOPWORDS = frozenset(_STOPWORDS_TEXT.split())


def _stem(token: str) -> str:
    """Tiny suffix stripper: good enough to match return/returns/returned."""
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    for suffix in ("ing", "ed"):
        if len(token) > len(suffix) + 2 and token.endswith(suffix):
            token = token[: -len(suffix)]
            if len(token) > 2 and token[-1] == token[-2] and token[-1] not in "aeiouls":
                token = token[:-1]
            return token
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    return [_stem(t) for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOPWORDS]


# ---------------------------------------------------------------------------
# Retrievers
# ---------------------------------------------------------------------------


@runtime_checkable
class Retriever(Protocol):
    def index(self, chunks: Sequence[Chunk]) -> None: ...

    def search(self, query: str, top_k: int) -> list[SearchHit]: ...


class BM25Retriever:
    """Okapi BM25 over the chunk texts. Pure Python, no downloads."""

    def __init__(self, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b
        self._chunks: list[Chunk] = []
        self._tfs: list[Counter[str]] = []
        self._lengths: list[int] = []
        self._idf: dict[str, float] = {}
        self._avg_len = 0.0

    def index(self, chunks: Sequence[Chunk]) -> None:
        self._chunks = list(chunks)
        self._tfs = [Counter(tokenize(c.search_text)) for c in self._chunks]
        self._lengths = [sum(tf.values()) for tf in self._tfs]
        n = len(self._chunks)
        self._avg_len = (sum(self._lengths) / n) if n else 0.0
        df: Counter[str] = Counter()
        for tf in self._tfs:
            df.update(tf.keys())
        self._idf = {t: math.log((n - f + 0.5) / (f + 0.5) + 1.0) for t, f in df.items()}

    def search(self, query: str, top_k: int) -> list[SearchHit]:
        terms = set(tokenize(query))
        scored: list[SearchHit] = []
        for chunk, tf, length in zip(self._chunks, self._tfs, self._lengths, strict=True):
            score = 0.0
            norm = self.k1 * (1 - self.b + self.b * length / (self._avg_len or 1.0))
            for term in terms:
                freq = tf.get(term)
                if freq:
                    score += self._idf[term] * freq * (self.k1 + 1) / (freq + norm)
            if score > 0:
                scored.append(SearchHit(chunk, score))
        return _top(scored, top_k)


@runtime_checkable
class Embedder(Protocol):
    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class HashingEmbedder:
    """Deterministic dense embeddings via feature hashing of (stemmed) tokens with
    sublinear term frequency, L2-normalized. Stand-in for a real embedding model."""

    def __init__(self, dimensions: int = 512) -> None:
        self.dimensions = dimensions

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        vectors = []
        for text in texts:
            vector = [0.0] * self.dimensions
            for token, count in Counter(tokenize(text)).items():
                digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
                bucket = int.from_bytes(digest[:4], "little") % self.dimensions
                sign = 1.0 if digest[4] & 1 else -1.0
                vector[bucket] += sign * (1.0 + math.log(count))
            norm = math.sqrt(sum(v * v for v in vector)) or 1.0
            vectors.append([v / norm for v in vector])
        return vectors


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


class EmbeddingRetriever:
    """Cosine-similarity search over vectors from any :class:`Embedder`."""

    def __init__(self, embedder: Embedder, min_score: float = 0.0) -> None:
        self.embedder = embedder
        self.min_score = min_score
        self._chunks: list[Chunk] = []
        self._vectors: list[list[float]] = []

    def index(self, chunks: Sequence[Chunk]) -> None:
        self._chunks = list(chunks)
        self._vectors = self.embedder.embed([c.search_text for c in self._chunks]) if chunks else []

    def search(self, query: str, top_k: int) -> list[SearchHit]:
        [query_vector] = self.embedder.embed([query])
        hits = [
            SearchHit(chunk, score)
            for chunk, vector in zip(self._chunks, self._vectors, strict=True)
            if (score := cosine(query_vector, vector)) > self.min_score
        ]
        return _top(hits, top_k)


def _top(hits: list[SearchHit], top_k: int) -> list[SearchHit]:
    # Sort by score desc, then source id for deterministic tie-breaking.
    return sorted(hits, key=lambda h: (-h.score, h.chunk.source_id))[: max(top_k, 0)]


# ---------------------------------------------------------------------------
# Knowledge base
# ---------------------------------------------------------------------------


class KnowledgeBase:
    def __init__(self, chunks: Sequence[Chunk], retriever: Retriever | None = None) -> None:
        self.chunks = list(chunks)
        self.retriever = retriever or BM25Retriever()
        self.retriever.index(self.chunks)
        self._by_id = {c.source_id: c for c in self.chunks}

    @classmethod
    def from_directory(cls, path: str | Path, retriever: Retriever | None = None) -> KnowledgeBase:
        directory = Path(path)
        if not directory.is_dir():
            raise FileNotFoundError(f"Knowledge base directory not found: {directory}")
        chunks: list[Chunk] = []
        for file in sorted(directory.glob("*.md")):
            chunks.extend(chunk_markdown(file.stem, file.read_text(encoding="utf-8")))
        return cls(chunks, retriever)

    def get(self, source_id: str) -> Chunk | None:
        return self._by_id.get(source_id)

    def search(self, query: str, top_k: int = 3) -> list[SearchHit]:
        return self.retriever.search(query, top_k)
