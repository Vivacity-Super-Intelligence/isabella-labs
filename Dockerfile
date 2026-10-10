FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    VIVACITY_DATABASE=/tmp/vivacity.sqlite3

WORKDIR /app

COPY requirements-lock.txt ./
RUN python -m pip install --no-cache-dir -r requirements-lock.txt

COPY vivacity ./vivacity
COPY assets ./assets

EXPOSE 8000

CMD ["sh", "-c", "uvicorn vivacity.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
