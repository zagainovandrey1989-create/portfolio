from __future__ import annotations

from collections.abc import Sequence

import pytest

from support_agent.retrieval import (
    BM25Retriever,
    EmbeddingRetriever,
    HashingEmbedder,
    KnowledgeBase,
    chunk_markdown,
    cosine,
    tokenize,
)

DOC = """# Sample Doc

Intro paragraph.

## First Section

Alpha text.

## First Section

Duplicate heading.

## Empty

## Long

para one is here.

para two is here.
"""


def test_chunk_markdown_ids_titles_and_sections() -> None:
    chunks = chunk_markdown("sample", DOC, max_chars=20)
    assert [c.source_id for c in chunks] == [
        "sample#overview",
        "sample#first-section",
        "sample#first-section-2",
        "sample#long",
        "sample#long-2",
    ]
    assert {c.title for c in chunks} == {"Sample Doc"}
    assert chunks[1].heading == "First Section"
    assert chunks[1].text == "Alpha text."
    assert chunks[3].text == "para one is here."


def test_tokenize_stems_and_drops_stopwords() -> None:
    assert tokenize("The Returns are returned when Returning!") == ["return", "return", "return"]
    assert tokenize("shipping ships policies") == ["ship", "ship", "policy"]


def test_knowledge_base_loads_all_documents(kb: KnowledgeBase) -> None:
    doc_ids = {c.doc_id for c in kb.chunks}
    assert doc_ids == {
        "payments",
        "promotions",
        "returns-and-refunds",
        "shipping-policy",
        "warranty",
    }
    assert kb.get("shipping-policy#tracking").title == "Shipping Policy"
    assert kb.get("missing#nope") is None


@pytest.mark.parametrize(
    ("query", "expected_top"),
    [
        ("How long does international shipping take?", "shipping-policy#international-shipping"),
        ("When will I get my refund?", "returns-and-refunds#refunds"),
        ("is water damage covered", "warranty#what-is-not-covered"),
        ("which payment methods do you accept", "payments#accepted-payment-methods"),
        ("can I exchange an item for another size", "returns-and-refunds#exchanges"),
    ],
)
def test_bm25_ranking(kb: KnowledgeBase, query: str, expected_top: str) -> None:
    hits = kb.search(query, top_k=3)
    assert hits[0].chunk.source_id == expected_top
    scores = [h.score for h in hits]
    assert scores == sorted(scores, reverse=True)
    assert all(s > 0 for s in scores)


def test_top_k_and_no_match(kb: KnowledgeBase) -> None:
    assert len(kb.search("shipping", top_k=2)) == 2
    assert kb.search("xylophone quantum zebra", top_k=3) == []
    assert kb.search("shipping", top_k=0) == []


def test_bm25_is_deterministic_on_ties() -> None:
    chunks = chunk_markdown("d", "## A\n\nsame words\n\n## B\n\nsame words\n")
    retriever = BM25Retriever()
    retriever.index(chunks)
    assert [h.chunk.source_id for h in retriever.search("same", 5)] == ["d#a", "d#b"]


def test_hashing_embedder_retriever(data_dir) -> None:
    kb = KnowledgeBase.from_directory(data_dir, retriever=EmbeddingRetriever(HashingEmbedder()))
    hits = kb.search("warranty claim photo video defect", top_k=3)
    assert hits[0].chunk.source_id == "warranty#making-a-warranty-claim"
    [vector] = HashingEmbedder(dimensions=64).embed(["hello world"])
    assert len(vector) == 64
    assert cosine(vector, vector) == pytest.approx(1.0)


def test_custom_embedder_is_pluggable() -> None:
    class KeywordEmbedder:
        """Toy embedder: one dimension per keyword."""

        vocab = ("cat", "dog")

        def embed(self, texts: Sequence[str]) -> list[list[float]]:
            return [[float(word in t.lower()) for word in self.vocab] for t in texts]

    chunks = chunk_markdown("pets", "## Cats\n\nA cat purrs.\n\n## Dogs\n\nA dog barks.\n")
    kb = KnowledgeBase(chunks, retriever=EmbeddingRetriever(KeywordEmbedder()))
    assert [h.chunk.source_id for h in kb.search("my dog", 5)] == ["pets#dogs"]


def test_missing_directory_raises(tmp_path) -> None:
    with pytest.raises(FileNotFoundError):
        KnowledgeBase.from_directory(tmp_path / "nope")
