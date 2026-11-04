"""The tool-calling loop both copilots share: one question in, an answer from the tools.

google-genai's automatic function calling runs the tools (at most ``max_tool_calls`` per turn);
the recorder keeps every call, so what an answer is built from comes from the tools, never from
the model's text. The instruction and the tools are the caller's: the ops copilot's, or the
site's business one. Light on purpose: no tools of its own.
"""

from __future__ import annotations

from collections.abc import Callable

from pulse_copilot.answer import Recorder


class Engine:
    def __init__(
        self,
        instruction: str,
        *,
        client,
        model: str,
        max_tool_calls: int = 5,
        history_messages: int = 6,
        max_output_tokens: int = 1024,
    ) -> None:
        self.instruction = instruction
        self.client = client
        self.model = model
        self.max_tool_calls = max_tool_calls
        self.history_messages = history_messages
        self.max_output_tokens = max_output_tokens

    def config(self, tools: list):
        from google.genai import types

        lite = "flash-lite" in self.model
        return types.GenerateContentConfig(
            system_instruction=self.instruction,
            tools=tools,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(
                maximum_remote_calls=self.max_tool_calls
            ),
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MINIMAL if lite else types.ThinkingLevel.LOW,
                include_thoughts=False,
            ),
            max_output_tokens=self.max_output_tokens,
        )

    def contents(self, history: list[dict], message: str) -> list:
        from google.genai import types

        contents = []
        for turn in history[-self.history_messages :]:
            role = "model" if turn.get("role") in {"assistant", "model"} else "user"
            if turn.get("text"):
                contents.append(types.Content(role=role, parts=[types.Part(text=turn["text"])]))
        contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
        return contents

    def run(
        self, message: str, history: list[dict], tools: list[Callable], recorder: Recorder
    ) -> tuple[str, dict]:
        """The answer's text and its token usage; every tool call lands in ``recorder``.
        Raises what the client raises (the caller words it)."""
        response = self.client.models.generate_content(
            model=self.model,
            contents=self.contents(history, message),
            config=self.config([recorder.wrap(tool) for tool in tools]),
        )
        usage = getattr(response, "usage_metadata", None)
        return (response.text or "").strip(), {
            "prompt_tokens": getattr(usage, "prompt_token_count", None),
            "output_tokens": getattr(usage, "candidates_token_count", None),
            "total_tokens": getattr(usage, "total_token_count", None),
        }
