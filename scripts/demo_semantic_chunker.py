"""Quick demo / sanity script for the semantic chunker.

Not run as part of the test suite — invoked manually to inspect chunk
sizes on a representative ~3000-token input. Uses a deterministic
embedding stub so it runs without Azure credentials.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import List

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import tiktoken

from backend.ingestion.semantic_chunker import SemanticChunker


# A ~3000-token article composed of three distinct topics.
TOPIC_A = (
    "The history of pizza begins in southern Italy, particularly in the "
    "city of Naples. Naples in the 18th century was a thriving waterfront "
    "city that attracted poor labourers known as lazzaroni. These workers "
    "needed inexpensive food that could be eaten quickly, and flatbreads "
    "with various toppings sold by street vendors filled that gap. "
    "The classic margherita pizza, topped with tomato, mozzarella, and "
    "basil, was reportedly created in 1889 in honour of Queen Margherita "
    "of Savoy. Pizza spread across Italy and eventually to the United "
    "States with Italian immigrants in the late 19th and early 20th "
    "centuries. The first licensed pizzeria in the United States, "
    "Lombardi's, opened in New York in 1905. After World War II, "
    "returning American soldiers helped popularise pizza nationwide. "
    "Today pizza exists in countless regional variations, from the thick "
    "deep dish of Chicago to the thin Roman style and the Neapolitan "
    "wood-fired pies certified by the Associazione Verace Pizza "
    "Napoletana. "
) * 5

TOPIC_B = (
    "Quantum computing exploits the strange properties of quantum "
    "mechanics, including superposition and entanglement, to perform "
    "calculations that would be infeasible on classical hardware. A "
    "classical bit holds either zero or one, but a quantum bit, or "
    "qubit, can hold a probabilistic combination of both at once. By "
    "operating on many qubits in superposition, a quantum processor can "
    "in principle explore an exponentially large state space in a single "
    "step. Algorithms such as Shor's algorithm for factoring large "
    "integers and Grover's algorithm for searching unsorted databases "
    "demonstrate provable speedups over classical counterparts. However, "
    "qubits are extraordinarily fragile: tiny interactions with the "
    "environment cause decoherence, which destroys their quantum state "
    "and corrupts the result. Modern quantum computers therefore depend "
    "on aggressive error correction, cryogenic cooling, and careful "
    "isolation. Companies including IBM, Google, and several startups "
    "now operate quantum processors with hundreds of physical qubits, "
    "though scaling to fault-tolerant logical qubits remains the central "
    "engineering challenge of the field. "
) * 5

TOPIC_C = (
    "The Roman aqueducts were among the most impressive engineering "
    "achievements of the ancient world. Built primarily between the "
    "fourth century BC and the third century AD, these long stone "
    "channels delivered fresh water from distant springs and rivers to "
    "Roman cities, where it fed public baths, fountains, latrines, and "
    "private homes. The aqueduct of Aqua Appia, finished in 312 BC, was "
    "the first to serve the city of Rome. Later structures such as the "
    "Aqua Claudia and the Anio Novus stretched for tens of kilometres "
    "and crossed valleys on towering arched bridges still visible today. "
    "The Romans relied on gravity alone: a gentle, continuous downward "
    "gradient carried water along the channel for the entire route. "
    "Engineers used inverted siphons, lead pipes, and settling tanks to "
    "manage pressure and sediment. By the height of the empire the city "
    "of Rome was supplied by eleven major aqueducts, providing more "
    "water per capita than many modern cities. "
) * 5


async def main() -> None:
    text = TOPIC_A + TOPIC_B + TOPIC_C
    tokenizer = tiktoken.get_encoding("cl100k_base")
    total_tokens = len(tokenizer.encode(text))
    print(f"Input text: {total_tokens} tokens")

    # Bag-of-chars stub embedder — deterministic, no network needed.
    async def bag_embed(texts: List[str]) -> List[List[float]]:
        out = []
        for t in texts:
            vec = [0.0] * 27
            for ch in t.lower():
                if "a" <= ch <= "z":
                    vec[ord(ch) - ord("a")] += 1.0
                else:
                    vec[26] += 1.0
            out.append(vec)
        return out

    chunker = SemanticChunker(
        target_min=300,
        target_max=600,
        overlap_tokens=100,
        similarity_threshold=0.5,
        embedding_fn=bag_embed,
        tokenizer=tokenizer,
    )

    chunks = await chunker.chunk(text)
    print(f"Produced {len(chunks)} chunks")
    for i, c in enumerate(chunks):
        toks = len(tokenizer.encode(c))
        head = c[:80].replace("\n", " ")
        print(f"  [{i}] {toks:4d} tokens | {head!r}...")

    # Corner case: per-page sentence cap fallback.
    print("\n--- Per-page sentence cap fallback ---")
    sentence = (
        "This is a moderately long sentence about widgets and gadgets."
    )
    big_text = " ".join([sentence] * 250)
    big_tokens = len(tokenizer.encode(big_text))
    print(f"Oversize input: {big_tokens} tokens, 250 sentences")

    fallback_chunker = SemanticChunker(
        target_min=300,
        target_max=600,
        overlap_tokens=100,
        similarity_threshold=0.5,
        max_sentences_per_page=200,
        embedding_fn=bag_embed,
        tokenizer=tokenizer,
    )

    embed_calls = {"n": 0}

    async def counting(texts):
        embed_calls["n"] += 1
        return await bag_embed(texts)

    fallback_chunker._embedding_fn = counting
    fb_chunks = await fallback_chunker.chunk(big_text)
    print(
        f"  -> {len(fb_chunks)} chunks produced; embedder called "
        f"{embed_calls['n']} times (expected 0)"
    )
    for i, c in enumerate(fb_chunks[:3]):
        toks = len(tokenizer.encode(c))
        print(f"  [{i}] {toks} tokens")


if __name__ == "__main__":
    asyncio.run(main())
