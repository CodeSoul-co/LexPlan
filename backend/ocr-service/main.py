from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="LexPlan OCR Service", version="0.1.0")

OCR_UPLOAD_ROOT = Path(os.getenv("OCR_UPLOAD_ROOT", "/data/uploads"))
OCR_LANG = os.getenv("OCR_LANG", "ch")
OCR_DEVICE = os.getenv("OCR_DEVICE", "gpu:0")
OCR_ENGINE = os.getenv("OCR_ENGINE", "paddle_static")

_engine: Any | None = None


class OcrRequest(BaseModel):
    textbookId: str
    fileName: str | None = None
    fileRef: str | None = None
    filePath: str | None = None
    mimeType: str | None = None


def resolve_input_path(request: OcrRequest) -> Path:
    candidates: list[Path] = []
    if request.filePath:
        raw = request.filePath
        if raw.startswith("/data/uploads/"):
            candidates.append(OCR_UPLOAD_ROOT / raw.removeprefix("/data/uploads/"))
        candidates.append(Path(raw))
    if request.fileRef and request.fileRef.startswith("upload://"):
        candidates.append(OCR_UPLOAD_ROOT / request.fileRef.removeprefix("upload://"))
    if request.fileName:
        candidates.append(OCR_UPLOAD_ROOT / request.fileName)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    raise HTTPException(status_code=404, detail="OCR input file was not found in mounted uploads.")


def get_engine() -> Any:
    global _engine
    if _engine is not None:
        return _engine

    from paddleocr import PaddleOCR

    common_kwargs = {
        "lang": OCR_LANG,
        "use_doc_orientation_classify": os.getenv("OCR_USE_DOC_ORIENTATION_CLASSIFY", "false").lower() == "true",
        "use_doc_unwarping": os.getenv("OCR_USE_DOC_UNWARPING", "false").lower() == "true",
        "use_textline_orientation": os.getenv("OCR_USE_TEXTLINE_ORIENTATION", "false").lower() == "true",
    }
    if OCR_DEVICE:
        common_kwargs["device"] = OCR_DEVICE

    _engine = PaddleOCR(**common_kwargs)
    return _engine


def normalize_prediction(result: Any) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    if result is None:
        return pages
    items = result if isinstance(result, list) else [result]
    for index, item in enumerate(items):
        text_parts: list[str] = []
        confidence_values: list[float] = []
        blocks: list[dict[str, Any]] = []

        data = item
        if hasattr(item, "json"):
            try:
                data = item.json
            except Exception:
                data = item
        if hasattr(item, "res"):
            data = item.res

        if isinstance(data, dict):
            rec_texts = data.get("rec_texts") or data.get("texts") or []
            rec_scores = data.get("rec_scores") or data.get("scores") or []
            rec_boxes = data.get("rec_boxes") or data.get("dt_polys") or []
            for i, text in enumerate(rec_texts):
                if not isinstance(text, str) or not text.strip():
                    continue
                score = rec_scores[i] if i < len(rec_scores) and isinstance(rec_scores[i], (int, float)) else None
                text_parts.append(text.strip())
                if score is not None:
                    confidence_values.append(float(score))
                block: dict[str, Any] = {"type": "paragraph", "text": text.strip()}
                if score is not None:
                    block["confidence"] = float(score)
                if i < len(rec_boxes):
                    block["bbox"] = rec_boxes[i]
                blocks.append(block)
        elif isinstance(data, list):
            for row in data:
                try:
                    text = row[1][0]
                    score = row[1][1]
                except Exception:
                    continue
                if isinstance(text, str) and text.strip():
                    text_parts.append(text.strip())
                    if isinstance(score, (int, float)):
                        confidence_values.append(float(score))
                    blocks.append({"type": "paragraph", "text": text.strip(), "confidence": score})

        page_text = "\n".join(text_parts).strip()
        if page_text:
            confidence = sum(confidence_values) / len(confidence_values) if confidence_values else None
            pages.append({
                "pageNumber": index + 1,
                "text": page_text,
                "confidence": confidence,
                "blocks": blocks,
            })
    return pages


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "lexplan-ocr-service",
        "engine": OCR_ENGINE,
        "lang": OCR_LANG,
        "device": OCR_DEVICE,
    }


@app.post("/ocr")
def recognize(request: OcrRequest) -> dict[str, Any]:
    input_path = resolve_input_path(request)
    engine = get_engine()
    try:
        result = engine.predict(str(input_path)) if hasattr(engine, "predict") else engine.ocr(str(input_path))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR failed: {exc}") from exc

    pages = normalize_prediction(result)
    if not pages:
        raise HTTPException(status_code=422, detail="OCR completed but produced no readable text.")
    return {
        "textbookId": request.textbookId,
        "provider": "paddleocr",
        "pages": pages,
    }