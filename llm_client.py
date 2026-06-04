from __future__ import annotations

import os
from typing import Any

OLLAMA_MODEL_DEFAULT = os.environ.get("OLLAMA_MODEL", "llama3.2")
OLLAMA_HOST_DEFAULT = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
VISION_MODEL_DEFAULT = os.environ.get("OLLAMA_VISION_MODEL", "moondream")
VISION_MODEL_CANDIDATES = (
    "moondream",
    "llava",
    "llama3.2-vision",
    "granite3.2-vision",
    "bakllava",
    "minicpm-v",
)
OLLAMA_KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "15m")
OLLAMA_NUM_PREDICT = int(os.environ.get("OLLAMA_NUM_PREDICT", "220"))


def resolve_vision_model(client: Any, preferred: str = VISION_MODEL_DEFAULT) -> str | None:
    try:
        listed = client.list()
        raw_names: list[str] = []
        for m in listed.models:
            name = getattr(m, "model", None) or getattr(m, "name", None) or ""
            if name:
                raw_names.append(name)
        base_names = {n.split(":")[0] for n in raw_names}
        pref_base = preferred.split(":")[0]
        if pref_base in base_names:
            for n in raw_names:
                if n.split(":")[0] == pref_base:
                    return n
            return preferred
        for candidate in VISION_MODEL_CANDIDATES:
            if candidate in base_names:
                for n in raw_names:
                    if n.split(":")[0] == candidate:
                        return n
        for n in raw_names:
            base = n.split(":")[0]
            if any(k in base.lower() for k in ("vision", "llava", "moondream")):
                return n
    except Exception:
        return None
    return None


class OllamaLLM:
    provider = "ollama"

    def __init__(
        self,
        model: str = OLLAMA_MODEL_DEFAULT,
        host: str = OLLAMA_HOST_DEFAULT,
    ) -> None:
        try:
            from ollama import Client
        except ImportError as exc:
            raise RuntimeError(
                "Missing dependency 'ollama'. Install with: pip install -r requirements.txt"
            ) from exc
        self.text_model = model
        self._client = Client(host=host)
        self._vision_model_name = resolve_vision_model(self._client)

    def _options(self, *, num_predict: int | None = None) -> dict[str, Any]:
        return {
            "temperature": 0.1,
            "num_predict": num_predict or OLLAMA_NUM_PREDICT,
            "keep_alive": OLLAMA_KEEP_ALIVE,
        }

    def check_connection(self) -> None:
        try:
            self._client.list()
        except Exception as exc:
            raise ConnectionError(
                "Cannot reach Ollama. Install from https://ollama.com/download, "
                f"start the app, then: ollama pull {self.text_model}"
            ) from exc

    def warmup(self) -> None:
        try:
            self._client.chat(
                model=self.text_model,
                messages=[{"role": "user", "content": '{"ok":true}'}],
                format="json",
                options={**self._options(), "num_predict": 32},
            )
            if self._vision_model_name:
                self._client.chat(
                    model=self._vision_model_name,
                    messages=[{"role": "user", "content": "ok"}],
                    options={**self._options(), "num_predict": 8},
                )
        except Exception:
            pass

    def chat_json(self, system: str, user: str) -> str:
        response = self._client.chat(
            model=self.text_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            format="json",
            options=self._options(),
        )
        return response.message.content or ""

    def has_vision(self) -> bool:
        return self._vision_model_name is not None

    def vision_model(self) -> str | None:
        return self._vision_model_name

    def chat_json_with_image(self, system: str, user: str, image_bytes: bytes) -> str:
        import base64

        if not self._vision_model_name:
            raise RuntimeError("No vision model. Run: ollama pull moondream")
        b64 = base64.b64encode(image_bytes).decode("ascii")
        response = self._client.chat(
            model=self._vision_model_name,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user, "images": [b64]},
            ],
            format="json",
            options=self._options(),
        )
        return response.message.content or ""


def create_llm_client(
    *,
    model: str | None = None,
    host: str | None = None,
) -> OllamaLLM:
    return OllamaLLM(
        model=model or OLLAMA_MODEL_DEFAULT,
        host=host or OLLAMA_HOST_DEFAULT,
    )
