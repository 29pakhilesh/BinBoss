#!/usr/bin/env python3

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from waste_classifier import (
    DEFAULT_CONFIG,
    DEFAULT_HOST,
    DEFAULT_MODEL,
    MAX_IMAGE_BYTES,
    WasteClassifier,
    load_bins,
)

WEB_DIR = Path(__file__).resolve().parent / "web"

_classifier: WasteClassifier | None = None
_warmup_started = False


def _warmup_models() -> None:
    try:
        clf = get_classifier()
        clf.warmup()
        clf.warmup_vision()
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _warmup_started
    if not _warmup_started:
        _warmup_started = True
        asyncio.create_task(asyncio.to_thread(_warmup_models))
    yield


app = FastAPI(title="BinBoss", version="1.0.0", lifespan=lifespan)


def get_classifier() -> WasteClassifier:
    global _classifier
    if _classifier is None:
        config = Path(os.environ.get("DUSTBIN_CONFIG", str(DEFAULT_CONFIG)))
        bins = load_bins(config)
        _classifier = WasteClassifier(
            bins,
            model=os.environ.get("OLLAMA_MODEL", DEFAULT_MODEL),
            host=os.environ.get("OLLAMA_HOST", DEFAULT_HOST),
        )
        _classifier.check_connection()
    return _classifier


class ClassifyRequest(BaseModel):
    item: str = Field(..., min_length=1, max_length=500)


class BinInfo(BaseModel):
    id: str
    name: str
    color: str
    accepts: list[str]


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


@app.get("/api/health")
async def health() -> dict:
    try:
        clf = get_classifier()
        return {
            "ok": True,
            "provider": clf.provider,
            "vision": clf.has_vision(),
            "vision_model": clf.vision_model(),
            "text_model": clf.model,
        }
    except Exception as exc:
        return {
            "ok": False,
            "provider": None,
            "vision": False,
            "error": str(exc),
        }


@app.get("/api/bins")
async def list_bins() -> list[BinInfo]:
    classifier = get_classifier()
    return [
        BinInfo(id=b.id, name=b.name, color=b.color, accepts=b.accepts)
        for b in classifier.bins
    ]


@app.post("/api/classify")
async def classify(req: ClassifyRequest) -> dict:
    try:
        result = await asyncio.to_thread(get_classifier().classify, req.item)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result.to_dict()


@app.post("/api/classify-image")
async def classify_image(file: UploadFile = File(...)) -> dict:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload must be an image (JPEG or PNG).")

    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 8 MB).")

    try:
        clf = get_classifier()
        if not clf.has_vision():
            raise HTTPException(
                status_code=503,
                detail="Camera needs a vision model: ollama pull moondream",
            )
        result = await asyncio.to_thread(clf.classify_image, data)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result.to_dict()


app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")


def _pick_port(preferred: int, host: str) -> int:
    import socket

    bind_host = host if host else "127.0.0.1"
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((bind_host, port))
                return port
            except OSError:
                continue
    raise SystemExit(f"No free port between {preferred} and {preferred + 19}")


def _lan_ip() -> str | None:
    import socket

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("HOST", "127.0.0.1")
    preferred = int(os.environ.get("PORT", "8080"))
    port = _pick_port(preferred, host)
    if port != preferred:
        print(f"Port {preferred} in use — using port {port} instead")
    print(f"On this Mac:  http://127.0.0.1:{port}")
    if host == "0.0.0.0":
        ip = _lan_ip()
        if ip:
            print(f"On home Wi‑Fi: http://{ip}:{port}  (use this on phones/tablets)")
        else:
            print("On home Wi‑Fi: use this computer's IP from System Settings → Network")
    uvicorn.run("app:app", host=host, port=port, reload=False)
