"""The language model the site calls (Gemini): one per app, a fake in tests.

The key and the model are the pipeline's (GEMINI_API_KEY, GEMINI_MODEL), read from the
environment and never kept in the settings. Without a key the model is not available, and the
site keeps what it has. Each call's tokens go to the log, never the text it was sent.
"""

from __future__ import annotations

import logging
import os

from pydantic import BaseModel

from pulse_copilot.gemini import DEFAULT_MODEL, error_code, make_client

log = logging.getLogger("pulse_server.llm")


class LlmError(Exception):
    """No answer from the model; ``code`` says why (llm_unavailable, llm_quota, ...)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class Llm:
    def __init__(self, api_key: str = "", model: str | None = None, client=None) -> None:
        self._key = api_key
        self._client = client
        self.model = (model or DEFAULT_MODEL).removeprefix("gemini/")

    @classmethod
    def from_env(cls) -> Llm:
        return cls(os.getenv("GEMINI_API_KEY", ""), os.getenv("GEMINI_MODEL") or None)

    @property
    def available(self) -> bool:
        return self._client is not None or bool(self._key)

    @property
    def client(self):
        if self._client is None:
            self._client = make_client(self._key)
        return self._client

    def structured(self, purpose: str, instruction: str, contents: str, schema: type[BaseModel]):
        """One answer in the shape of ``schema``, or LlmError."""
        if not self.available:
            raise LlmError("llm_unavailable")
        from google.genai import types

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=instruction,
                    response_mime_type="application/json",
                    response_schema=schema,
                    temperature=0.0,
                ),
            )
            parsed = response.parsed
            if not isinstance(parsed, schema):
                parsed = schema.model_validate_json(response.text or "")
        except Exception as exc:  # noqa: BLE001 - every failure becomes a code the site words
            code = error_code(exc)
            log.warning(
                "%s: no answer from %s (%s, %s)", purpose, self.model, code, type(exc).__name__
            )
            raise LlmError(code) from exc
        usage = getattr(response, "usage_metadata", None)
        log.info(
            "%s: %s, %s prompt and %s output tokens",
            purpose,
            self.model,
            getattr(usage, "prompt_token_count", None),
            getattr(usage, "candidates_token_count", None),
        )
        return parsed
