FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    OCR_LANG=ch \
    OCR_DEVICE=gpu:0 \
    OCR_ENGINE=paddle_static \
    OCR_USE_DOC_ORIENTATION_CLASSIFY=false \
    OCR_USE_DOC_UNWARPING=false \
    OCR_USE_TEXTLINE_ORIENTATION=false \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=true

WORKDIR /srv/ocr-service

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-venv \
      ca-certificates \
      libglib2.0-0 \
      libgl1 \
      libgomp1 \
      libsm6 \
      libxext6 \
      libxrender1 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && ln -sf /usr/bin/pip3 /usr/local/bin/pip

COPY backend/ocr-service/requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install paddlepaddle-gpu==3.3.1 -i https://www.paddlepaddle.org.cn/packages/stable/cu118/ \
    && python -m pip install -r requirements.txt

COPY backend/ocr-service/ ./

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=3).read()"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8765"]