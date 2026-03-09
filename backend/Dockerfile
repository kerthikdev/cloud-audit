# ─────────────────────────────────────────────────────────────────
# Stage 1 — Dependency builder
#   Compiles C extensions (uvloop, etc.) in an isolated layer so
#   the final runtime image stays lean.
# ─────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Build tools for compiled Python packages (uvloop, cryptography …)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        build-essential \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install deps into an isolated prefix so we can COPY just them
COPY requirements.txt .
RUN pip install --upgrade pip \
 && pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─────────────────────────────────────────────────────────────────
# Stage 2 — Production runtime (no build tools, minimal attack surface)
# ─────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

LABEL org.opencontainers.image.title="CloudAudit Backend" \
      org.opencontainers.image.description="Cloud Resource Audit & Cost Optimization API" \
      org.opencontainers.image.version="4.0.0"

WORKDIR /app

# Non-root user for security
RUN groupadd -r cloudaudit && useradd -r -g cloudaudit -d /app cloudaudit

# Pull in pre-built packages
COPY --from=builder /install /usr/local

# Application source
COPY --chown=cloudaudit:cloudaudit app ./app

# Scan data persistence directory (mounted as a volume in compose)
RUN mkdir -p /data && chown cloudaudit:cloudaudit /data

USER cloudaudit

EXPOSE 8000

# Healthcheck — lightweight Python stdlib call, no curl needed
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# 2 workers = safe for async + background scan tasks
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--log-level", "info", \
     "--access-log"]