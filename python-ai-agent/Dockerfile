# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY pyproject.toml README.md LICENSE ./
COPY src ./src
RUN pip install ".[api]"

COPY data ./data

RUN useradd --create-home --uid 10001 agent
USER agent

# Offline demo model by default. To use a real OpenAI-compatible endpoint, run with
# -e SUPPORT_AGENT_DEMO=0 -e SUPPORT_AGENT_BASE_URL=... -e SUPPORT_AGENT_MODEL=... -e SUPPORT_AGENT_API_KEY=...
ENV SUPPORT_AGENT_DATA_DIR=/app/data \
    SUPPORT_AGENT_DEMO=1

EXPOSE 8000
CMD ["uvicorn", "support_agent.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
