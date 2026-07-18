# LexPlan OCR Service

FastAPI service wrapping PaddleOCR for LexPlan textbook PDF/image OCR.

The Docker image is built by `infra/docker/ocr-service/Dockerfile` and mounted with uploads at `/data/uploads`.

Health:

```text
GET /health
```

OCR:

```text
POST /ocr
{
  "textbookId": "...",
  "fileRef": "upload://file.pdf"
}
```