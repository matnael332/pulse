"""The Gemini client the site and the copilot share, and what its failures mean.

Light on purpose: importing it loads google-genai only when a client is built, never the
copilot's tools (and their scoring stack).
"""

from __future__ import annotations

DEFAULT_MODEL = "gemini-3.5-flash-lite"


def make_client(api_key: str):
    """A client that gives up after 60 s and retries what is worth retrying (rate, 5xx)."""
    from google import genai
    from google.genai import types

    retry = types.HttpRetryOptions(
        attempts=3,
        initial_delay=2.0,
        max_delay=20.0,
        exp_base=2.0,
        jitter=1.0,
        http_status_codes=[408, 429, 500, 502, 503, 504],
    )
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=60_000, retry_options=retry),
    )


def error_code(exc: Exception) -> str:
    """A failure as a stable code the site words: the quota, a refused key, no answer in time."""
    code = getattr(exc, "code", None)
    if code == 429 or "RESOURCE_EXHAUSTED" in str(exc):
        return "llm_quota"
    if code in (401, 403):
        return "llm_unavailable"
    if "timeout" in type(exc).__name__.lower() or "timed out" in str(exc).lower():
        return "llm_timeout"
    return "llm_failed"
