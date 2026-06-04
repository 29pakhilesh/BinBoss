#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Union

from humorous import HumorousResult, make_humorous_result
from llm_client import create_llm_client


class UnclassifiableItem(Exception):
    pass

MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_MAX_PX = int(os.environ.get("IMAGE_MAX_PX", "768"))
DEFAULT_CONFIG = Path(__file__).resolve().parent / "config" / "dustbins.json"
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
DEFAULT_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")


@dataclass
class Dustbin:
    id: str
    name: str
    color: str
    accepts: list[str]
    reject: list[str]


@dataclass
class ClassificationResult:
    item: str
    bin_id: str
    bin_name: str
    bin_color: str
    recyclable: bool
    compostable: bool
    decomposable: bool
    confidence: str
    reason: str
    tip: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "item": self.item,
            "bin_id": self.bin_id,
            "bin_name": self.bin_name,
            "bin_color": self.bin_color,
            "recyclable": self.recyclable,
            "compostable": self.compostable,
            "decomposable": self.decomposable,
            "confidence": self.confidence,
            "reason": self.reason,
            "tip": self.tip,
        }


def load_bins(config_path: Path) -> list[Dustbin]:
    data = json.loads(config_path.read_text(encoding="utf-8"))
    bins: list[Dustbin] = []
    for b in data["bins"]:
        bins.append(
            Dustbin(
                id=b["id"],
                name=b["name"],
                color=b.get("color", "unknown"),
                accepts=b.get("accepts", []),
                reject=b.get("reject", []),
            )
        )
    if not bins:
        raise ValueError(f"No bins defined in {config_path}")
    return bins


def _json_schema_fields(*, vision: bool) -> list[str]:
    fields = [
        '  "not_waste": boolean — YOU decide: true if not disposable physical trash, false if it is trash,',
        '  "bin_id": "<required when not_waste is false — exactly one id from the list; omit when not_waste is true>",',
        '  "recyclable": true or false,',
        '  "compostable": true or false,',
        '  "decomposable": true or false,',
        '  "confidence": "high" | "medium" | "low",',
        '  "reason": "<one or two sentences>",',
        '  "tip": "<short disposal tip>"',
    ]
    if vision:
        fields.insert(0, '  "detected_item": "<short name of the main waste object you see>",')
    return fields


def _build_system_prompt(bins: list[Dustbin], *, vision: bool = False) -> str:
    lines = [
        "You are a municipal waste-sorting assistant.",
    ]
    if vision:
        lines.append(
            "You will receive a photo. Identify the main waste item visible, "
            "then classify it into exactly ONE dustbin."
        )
    else:
        lines.append(
            "Classify the user's item into exactly ONE dustbin from the list below."
        )
    lines.extend(
        [
            "",
            "Step 1 — YOU decide if this is actual trash:",
            "- Trash (not_waste: false): physical objects people throw away — food scraps, packaging, batteries, phones, laptops, furniture, etc.",
            "- Not trash (not_waste: true): person names (e.g. Parth), living people, pets as beings, emotions, jokes, abstract ideas, empty/nonsense inputs.",
            "- Short words: interpret as waste when commonly thrown away (e.g. \"mobile\" = mobile phone → trash, not_waste false; \"paper\" → trash).",
            "",
            "Step 2 — If not_waste is false: set bin_id to exactly one bin below (never null).",
            "If not_waste is true: omit bin_id, write a witty friendly reason and tip, and do NOT pick a bin.",
            "",
            "Use local common-sense rules when ambiguous; prefer the safer bin (hazardous/special) for dangerous items.",
            "",
            "Always use these bin_id rules (synonyms count — cell phone = phone = mobile = smartphone):",
            "- ewaste: phones, cell phones, mobiles, smartphones, tablets, laptops, computers, monitors, TVs,",
            "  game consoles, chargers, cables, headphones, printers, routers, cameras, small appliances.",
            "- hazardous: loose batteries (AA/AAA/9V), CFL bulbs, paint, chemicals, medicines (not whole devices).",
            "- Never put phones or electronics in general or recyclable.",
            "",
            "Available dustbins:",
        ]
    )
    for b in bins:
        lines.append(f"- id={b.id!r} name={b.name!r} color={b.color}")
    lines.extend(
        [
            "",
            "Definitions:",
            "- recyclable: can be processed in recycling stream (paper, metal, glass, many plastics).",
            "- compostable: suitable for compost/organic bin (food scraps, yard waste, many natural fibers).",
            "- decomposable: will naturally biodegrade over time without special recycling (organic matter yes; metal, glass, most plastics no).",
            "An item can be compostable and decomposable but not recyclable (e.g. banana peel).",
            "",
            "Respond with JSON only, matching this schema:",
            "{",
            *_json_schema_fields(vision=vision),
            "}",
        ]
    )
    return "\n".join(lines)


def _build_result(
    bin_by_id: dict[str, Dustbin],
    item: str,
    data: dict[str, Any],
) -> ClassificationResult:
    bin_obj = bin_by_id[data["bin_id"]]
    default_compost = bin_obj.id == "organic"
    return ClassificationResult(
        item=item.strip(),
        bin_id=bin_obj.id,
        bin_name=bin_obj.name,
        bin_color=bin_obj.color,
        recyclable=bool(data.get("recyclable", bin_obj.id == "recyclable")),
        compostable=bool(data.get("compostable", default_compost)),
        decomposable=bool(data.get("decomposable", default_compost)),
        confidence=str(data.get("confidence", "medium")),
        reason=str(data.get("reason", "")),
        tip=str(data.get("tip", "")),
    )


def _load_json_dict(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [ln for ln in lines if not ln.strip().startswith("```")]
        text = "\n".join(lines).strip()
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("Model JSON must be an object")
    return data


def _parse_llm_json(
    raw: str, valid_ids: set[str], item: str = ""
) -> dict[str, Any]:
    try:
        data = _load_json_dict(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {raw[:200]}...") from exc

    if _is_not_waste_flag(data.get("not_waste")):
        return data

    data = _normalize_bin_choice(item, data, valid_ids)
    bin_id = _resolve_bin_id(data, valid_ids, item)
    if not bin_id:
        raise UnclassifiableItem(data.get("bin_id"))
    data["bin_id"] = bin_id
    return data


_EWASTE_ITEM_RE = re.compile(
    r"\b("
    r"cell\s*phones?|cellphones?|mobile\s*phones?|smart\s*phones?|smartphones?|"
    r"iphones?|ipads?|tablets?|"
    r"phones?|mobiles?|"
    r"laptops?|notebooks?|macbooks?|computers?|pcs?|"
    r"monitors?|keyboards?|mouses?|mice|"
    r"chargers?|cables?|earbuds?|headphones?|"
    r"cameras?|printers?|routers?|modems?|"
    r"tvs?|televisions?|consoles?|playstations?|xboxes?|nintendo|"
    r"smartwatches?|e-?waste|electronics?"
    r")\b",
    re.IGNORECASE,
)

_HAZARDOUS_LOOSE_RE = re.compile(
    r"\b("
    r"aa\s*batter(?:y|ies)|aaa\s*batter(?:y|ies)|9\s*v|"
    r"batter(?:y|ies)|light\s*bulbs?|cfls?|led\s*bulbs?|"
    r"paint|solvents?|medicines?|pills?|needles?|syringes?"
    r")\b",
    re.IGNORECASE,
)


def _hint_bin_from_item(item: str, valid_ids: set[str]) -> str | None:
    text = item.lower().strip()
    if not text:
        return None
    if re.search(r"\b(phone\s*book|storybook)\b", text):
        return "recyclable" if "recyclable" in valid_ids else None
    is_device = bool(
        re.search(
            r"\b(phone|cellphone|cell\s*phone|mobile|smartphone|tablet|laptop|"
            r"computer|charger|console|tv|monitor)\b",
            text,
        )
    )
    if not is_device and _HAZARDOUS_LOOSE_RE.search(text) and "hazardous" in valid_ids:
        return "hazardous"
    if _EWASTE_ITEM_RE.search(text) and "ewaste" in valid_ids:
        return "ewaste"
    return None


def _normalize_bin_choice(
    item: str, data: dict[str, Any], valid_ids: set[str]
) -> dict[str, Any]:
    if _is_not_waste_flag(data.get("not_waste")):
        return data
    hint = _hint_bin_from_item(item, valid_ids)
    if not hint:
        return data
    raw = data.get("bin_id")
    current: str | None = None
    if isinstance(raw, str):
        c = raw.strip().lower()
        if c not in ("none", "null", "n/a", ""):
            current = c
    if current != hint:
        data = dict(data)
        data["bin_id"] = hint
    return data


def _is_not_waste_flag(value: Any) -> bool:
    if value is True:
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1"}
    return False


def _resolve_bin_id(
    data: dict[str, Any], valid_ids: set[str], item: str = ""
) -> str | None:
    raw = data.get("bin_id")
    bin_id: str | None = None
    if isinstance(raw, str):
        candidate = raw.strip().lower()
        if candidate not in ("none", "null", "n/a", ""):
            bin_id = candidate
    if bin_id in valid_ids:
        hint = _hint_bin_from_item(item, valid_ids)
        if hint and bin_id != hint and bin_id in ("general", "recyclable"):
            return hint
        return bin_id

    hint = _hint_bin_from_item(item, valid_ids)
    if hint:
        return hint

    if data.get("compostable") and "organic" in valid_ids:
        return "organic"
    if data.get("recyclable") and "recyclable" in valid_ids:
        return "recyclable"

    blob = f"{item} {data.get('reason', '')} {data.get('tip', '')}".lower()
    if any(
        w in blob
        for w in (
            "hazardous",
            "battery acid",
            "chemical",
            "medical sharps",
            "needle",
        )
    ):
        if "hazardous" in valid_ids:
            return "hazardous"
    if any(
        w in blob
        for w in (
            "e-waste",
            "ewaste",
            "electronic",
            "laptop",
            "phone",
            "mobile",
            "smartphone",
            "tablet",
            "charger",
            "computer",
            "monitor",
            "television",
            "console",
        )
    ):
        if "ewaste" in valid_ids:
            return "ewaste"

    if "general" in valid_ids:
        return "general"
    return None


def _llm_says_not_waste(data: dict[str, Any]) -> bool:
    return _is_not_waste_flag(data.get("not_waste"))


def _prepare_image(image_bytes: bytes, max_px: int = IMAGE_MAX_PX) -> bytes:
    try:
        import io

        from PIL import Image
    except ImportError:
        return image_bytes

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=82, optimize=True)
        return out.getvalue()
    except Exception:
        return image_bytes


def _result_from_llm(
    bin_by_id: dict[str, Dustbin],
    item: str,
    data: dict[str, Any],
) -> Union[ClassificationResult, HumorousResult]:
    if _llm_says_not_waste(data):
        return make_humorous_result(
            item,
            reason=str(data.get("reason") or ""),
            tip=str(data.get("tip") or ""),
        )
    return _build_result(bin_by_id, item, data)


class WasteClassifier:
    def __init__(
        self,
        bins: list[Dustbin],
        model: str | None = None,
        host: str | None = None,
    ) -> None:
        self.bins = bins
        self.bin_by_id = {b.id: b for b in bins}
        self.valid_ids = set(self.bin_by_id)
        self.llm = create_llm_client(model=model, host=host or DEFAULT_HOST)
        self._system = _build_system_prompt(bins, vision=False)
        self._vision_system = _build_system_prompt(bins, vision=True)

    @property
    def model(self) -> str:
        return self.llm.text_model

    @property
    def provider(self) -> str:
        return self.llm.provider

    def check_connection(self) -> None:
        self.llm.check_connection()

    def warmup(self) -> None:
        self.llm.warmup()

    def warmup_vision(self) -> None:
        self.llm.warmup()

    def classify(self, item: str) -> Union[ClassificationResult, HumorousResult]:
        item = item.strip()
        if not item:
            raise ValueError("Item description cannot be empty.")
        try:
            content = self.llm.chat_json(
                self._system,
                f"Item to classify: {item}",
            )
            data = _parse_llm_json(content, self.valid_ids, item)
            return _result_from_llm(self.bin_by_id, item, data)
        except UnclassifiableItem:
            return make_humorous_result(
                item,
                reason="The bins couldn't place that one — try describing a clear throwaway object.",
                tip="e.g. plastic bottle, banana peel, old phone",
            )

    def has_vision(self) -> bool:
        return self.llm.has_vision()

    def vision_model(self) -> str | None:
        return self.llm.vision_model()

    def classify_image(
        self, image_bytes: bytes
    ) -> Union[ClassificationResult, HumorousResult]:
        if not image_bytes:
            raise ValueError("Image is empty.")
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise ValueError("Image too large (max 8 MB).")

        if not self.llm.has_vision():
            raise RuntimeError("Camera needs a vision model: ollama pull moondream")

        prepared = _prepare_image(image_bytes)
        content = self.llm.chat_json_with_image(
            self._vision_system,
            "Identify the main waste item and bin. JSON only.",
            prepared,
        )
        try:
            preview = _load_json_dict(content)
            detected = str(preview.get("detected_item", "item from photo")).strip()
            if not detected:
                detected = "item from photo"
            data = _parse_llm_json(content, self.valid_ids, detected)
            return _result_from_llm(self.bin_by_id, detected, data)
        except (json.JSONDecodeError, ValueError, UnclassifiableItem):
            return make_humorous_result(
                "what's in this photo",
                reason="We couldn't sort that photo — try a clearer shot of one item.",
                tip="Good light, one object, fill most of the frame.",
            )


def format_humorous(result: HumorousResult) -> str:
    return "\n".join(
        [
            f"Item: {result.item}",
            f"→ {result.title}",
            f"   {result.reason}",
            f"   Tip: {result.tip}",
        ]
    )


def format_result(result: ClassificationResult) -> str:
    lines = [
        f"Item: {result.item}",
        f"→ Bin: {result.bin_name} ({result.bin_color})",
        f"   ID: {result.bin_id} | Recyclable: {'yes' if result.recyclable else 'no'}",
        f"   Compostable: {'yes' if result.compostable else 'no'} | Decomposable: {'yes' if result.decomposable else 'no'}",
        f"   Confidence: {result.confidence}",
        f"   Reason: {result.reason}",
    ]
    if result.tip:
        lines.append(f"   Tip: {result.tip}")
    return "\n".join(lines)


def run_interactive(classifier: WasteClassifier) -> None:
    print("BinBoss (Ollama)")
    print("Describe an item, or type 'quit' to exit.\n")
    while True:
        try:
            item = input("What are you throwing away? ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break
        if not item:
            continue
        if item.lower() in {"quit", "exit", "q"}:
            print("Bye.")
            break
        try:
            result = classifier.classify(item)
            if isinstance(result, HumorousResult):
                print(format_humorous(result))
            else:
                print(format_result(result))
        except Exception as exc:
            print(f"Error: {exc}", file=sys.stderr)
        print()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Classify garbage into dustbins using a free local LLM (Ollama)."
    )
    parser.add_argument(
        "item",
        nargs="?",
        help="Item description (e.g. 'plastic water bottle'). Omit for interactive mode.",
    )
    parser.add_argument(
        "-c",
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help=f"Path to dustbins JSON (default: {DEFAULT_CONFIG})",
    )
    parser.add_argument(
        "-m",
        "--model",
        default=None,
        help="Ollama model name",
    )
    parser.add_argument(
        "--host",
        default=DEFAULT_HOST,
        help=f"Ollama API host when using ollama (default: {DEFAULT_HOST})",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print result as JSON",
    )
    parser.add_argument(
        "--list-bins",
        action="store_true",
        help="Show configured dustbins and exit",
    )
    args = parser.parse_args()

    if not args.config.is_file():
        print(f"Config not found: {args.config}", file=sys.stderr)
        return 1

    bins = load_bins(args.config)

    if args.list_bins:
        for b in bins:
            print(f"[{b.id}] {b.name} ({b.color})")
        return 0

    try:
        classifier = WasteClassifier(bins, model=args.model, host=args.host)
        classifier.check_connection()
    except (RuntimeError, ConnectionError) as exc:
        print(exc, file=sys.stderr)
        return 1

    if args.item:
        try:
            result = classifier.classify(args.item)
        except Exception as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
        if args.json:
            print(json.dumps(result.to_dict(), indent=2))
        elif isinstance(result, HumorousResult):
            print(format_humorous(result))
        else:
            print(format_result(result))
        return 0

    run_interactive(classifier)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
