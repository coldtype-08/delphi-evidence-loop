FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
ENV PORT=8080
CMD ["sh", "-c", "uv run uvicorn loop.web:app --host 0.0.0.0 --port ${PORT}"]
