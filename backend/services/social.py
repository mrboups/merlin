"""
Social sentiment analysis via the Grok (xAI) API.

Grok has native X/Twitter access and can analyze real-time social sentiment
for stocks and crypto assets.
"""

import json
import os

import httpx

GROK_API_KEY = os.environ.get("GROK_API_KEY", "")
GROK_API_URL = "https://api.x.ai/v1/chat/completions"


async def analyze_sentiment(symbol: str) -> dict | None:
    """
    Ask Grok to analyze current social sentiment for a stock/crypto symbol.

    Returns a dict with sentiment data, or None if the Grok API key is not
    configured.
    """
    if not GROK_API_KEY:
        return None

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            GROK_API_URL,
            headers={
                "Authorization": f"Bearer {GROK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "grok-3-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a financial sentiment analyst. Analyze current "
                            "social media sentiment for the given asset. Respond with "
                            'ONLY valid JSON: {"sentiment_score": <float -1 to 1>, '
                            '"summary": "<2-3 sentence summary>", '
                            '"outlook": "bullish|bearish|neutral"}'
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Analyze the current social media and market sentiment "
                            f"for {symbol}. What's the overall mood?"
                        ),
                    },
                ],
                "temperature": 0.3,
            },
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]

        try:
            result = json.loads(content)
            return {
                "symbol": symbol,
                "sentiment_score": float(result.get("sentiment_score", 0)),
                "summary": result.get("summary", ""),
                "outlook": result.get("outlook", "neutral"),
                "post_count": 0,
                "signal_count": 1,
            }
        except (json.JSONDecodeError, KeyError, ValueError):
            return {
                "symbol": symbol,
                "sentiment_score": 0,
                "summary": content[:500],
                "outlook": "neutral",
                "post_count": 0,
                "signal_count": 1,
            }
