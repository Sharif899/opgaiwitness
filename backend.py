"""
AIWitness — OpenGradient SDK Backend
=====================================
Real fact-checking engine powered by 4 AI models via TEE.
Every verdict is cryptographically signed and settled on-chain.

Cost: ~0.01 $OPG per claim (4 model calls)
Free tokens: https://faucet.opengradient.ai
"""

import asyncio
import os
import json
from dataclasses import dataclass, asdict
from typing import Literal
from datetime import datetime

import opengradient as og

PRIVATE_KEY = os.environ.get("OG_PRIVATE_KEY", "")

VerdictType = Literal["TRUE", "FALSE", "MISLEADING", "UNVERIFIABLE"]

# ── SYSTEM PROMPT ────────────────────────────────────────────────────────────
FACTCHECK_SYSTEM_PROMPT = """You are AIWitness, a rigorous fact-checking AI running inside a
Trusted Execution Environment on the OpenGradient network.

Your task: independently assess the factual accuracy of claims.

You MUST respond with ONLY valid JSON — no preamble, no markdown:
{
  "verdict": "TRUE" | "FALSE" | "MISLEADING" | "UNVERIFIABLE",
  "confidence": integer 50-99,
  "reasoning": "2-3 sentence explanation citing specific evidence or knowledge",
  "key_evidence": "The single most important fact supporting your verdict"
}

Verdict definitions:
- TRUE: The claim is accurate as stated, supported by evidence
- FALSE: The claim directly contradicts established evidence  
- MISLEADING: The claim contains truth but omits critical context or implies false conclusions
- UNVERIFIABLE: Insufficient evidence exists or the claim is a prediction/opinion

Be rigorous. Cite specific evidence. Do not hedge excessively."""


@dataclass
class ModelVerdict:
    model: str
    verdict: VerdictType
    confidence: int
    reasoning: str
    key_evidence: str
    tx_hash: str          # on-chain proof


@dataclass
class FactCheckResult:
    claim: str
    consensus_verdict: VerdictType
    agreement: str          # e.g. "3/4 models agree"
    model_verdicts: list
    proof_hashes: list      # one per model
    block_number: int
    checked_at: str
    verifiable_at: str = "https://explorer.opengradient.ai"


# ── SINGLE MODEL VERDICT ─────────────────────────────────────────────────────
async def get_model_verdict(
    claim: str,
    model: og.TEE_LLM,
    model_name: str,
    llm: og.LLM,
) -> ModelVerdict:
    """
    Gets a single model's verdict via OpenGradient TEE.
    The x402 payment_hash is the cryptographic proof of this verdict.
    """
    result = await llm.chat(
        model=model,
        messages=[
            {"role": "system", "content": FACTCHECK_SYSTEM_PROMPT},
            {"role": "user", "content": f'Fact-check this claim: "{claim}"'},
        ],
        max_tokens=300,
        temperature=0.1,  # Low temp for consistency
        x402_settlement_mode=og.x402SettlementMode.INDIVIDUAL_FULL,
        # Full prompt + output recorded on-chain — anyone can verify what the
        # model was asked and what it answered
    )

    raw = result.chat_output["content"]
    # Strip markdown fences if present
    if "```" in raw:
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else parts[0]
        if raw.startswith("json\n"):
            raw = raw[5:]

    data = json.loads(raw.strip())

    return ModelVerdict(
        model=model_name,
        verdict=data["verdict"],
        confidence=data["confidence"],
        reasoning=data["reasoning"],
        key_evidence=data.get("key_evidence", ""),
        tx_hash=result.payment_hash,   # ← THE ON-CHAIN PROOF
    )


# ── CONSENSUS FACT CHECK ──────────────────────────────────────────────────────
async def fact_check(claim: str) -> FactCheckResult:
    """
    Runs claim through ALL 4 models simultaneously.
    Each verdict is independently TEE-verified and settled on-chain.

    This is the core of AIWitness: not one AI's opinion,
    but 4 independent AI verdicts, all provably on-chain.
    """
    llm = og.LLM(private_key=PRIVATE_KEY)
    llm.ensure_opg_approval(opg_amount=10.0)

    model_configs = [
        (og.TEE_LLM.GPT_4_1_2025_04_14, "GPT-4.1"),
        (og.TEE_LLM.CLAUDE_SONNET_4_6, "Claude Sonnet"),
        (og.TEE_LLM.GEMINI_2_5_PRO, "Gemini 2.5 Pro"),
        (og.TEE_LLM.GROK_4_1_FAST, "Grok-4"),
    ]

    # All 4 models run in parallel — each in its own TEE enclave
    tasks = [
        get_model_verdict(claim, model, name, llm)
        for model, name in model_configs
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter successful verdicts
    verdicts = [r for r in results if isinstance(r, ModelVerdict)]

    # Calculate consensus
    counts = {}
    for v in verdicts:
        counts[v.verdict] = counts.get(v.verdict, 0) + 1

    consensus_verdict = max(counts, key=counts.get)
    top_count = counts[consensus_verdict]
    agreement = f"{top_count}/{len(verdicts)} models agree"

    return FactCheckResult(
        claim=claim,
        consensus_verdict=consensus_verdict,
        agreement=agreement,
        model_verdicts=[asdict(v) for v in verdicts],
        proof_hashes=[v.tx_hash for v in verdicts],
        block_number=0,  # would be populated from chain
        checked_at=datetime.utcnow().isoformat(),
    )


# ── FLASK API ──────────────────────────────────────────────────────────────
def create_app():
    try:
        from flask import Flask, request, jsonify
        from flask_cors import CORS
    except ImportError:
        print("pip install flask flask-cors")
        return None

    app = Flask(__name__)
    CORS(app)

    @app.route("/api/factcheck", methods=["POST"])
    def api_factcheck():
        data = request.json
        claim = data.get("claim", "").strip()
        if not claim:
            return jsonify({"success": False, "error": "No claim provided"}), 400
        if len(claim) > 1000:
            return jsonify({"success": False, "error": "Claim too long (max 1000 chars)"}), 400

        try:
            result = asyncio.run(fact_check(claim))
            return jsonify({"success": True, "data": asdict(result)})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    @app.route("/api/verify/<tx_hash>", methods=["GET"])
    def api_verify(tx_hash):
        return jsonify({
            "hash": tx_hash,
            "explorer_url": f"https://explorer.opengradient.ai/tx/{tx_hash}",
            "network": "OpenGradient Testnet",
        })

    return app


# ── DEMO ──────────────────────────────────────────────────────────────────
async def demo():
    print("AIWitness — OpenGradient Fact Checker Demo")
    print("=" * 50)

    claims = [
        "The Great Wall of China is visible from space with the naked eye.",
        "Bitcoin's total supply is capped at 21 million coins.",
    ]

    if not PRIVATE_KEY:
        print("Set OG_PRIVATE_KEY. Get free tokens: https://faucet.opengradient.ai")
        return

    for claim in claims:
        print(f"\nClaim: \"{claim}\"")
        print("Running 4-model TEE verification...")

        result = await fact_check(claim)

        print(f"\n✓ CONSENSUS: {result.consensus_verdict} ({result.agreement})")
        print(f"\nIndividual Verdicts:")
        for v in result.model_verdicts:
            print(f"  {v['model']:20} → {v['verdict']:15} ({v['confidence']}% confidence)")
            print(f"    Proof: {v['tx_hash'][:20]}...")

        print(f"\nAll 4 proofs verifiable at: {result.verifiable_at}")
        print("-" * 50)


if __name__ == "__main__":
    import sys
    if "--serve" in sys.argv:
        app = create_app()
        if app:
            print("AIWitness API on http://localhost:5001")
            app.run(debug=True, port=5001)
    else:
        asyncio.run(demo())
