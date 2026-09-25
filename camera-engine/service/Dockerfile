FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=5 \
    PYTHONPATH=/app/service

WORKDIR /app

RUN groupadd --system --gid 10001 engine \
    && useradd --system --uid 10001 --gid engine --home-dir /app --shell /usr/sbin/nologin engine

COPY service/requirements.txt /app/service/requirements.txt
RUN pip install --no-cache-dir --requirement /app/service/requirements.txt

COPY service/analyzer.py /app/service/analyzer.py
COPY service/app.py /app/service/app.py
COPY service/test_*.py /app/service/
COPY card_v1_geometry.yaml /app/config/card_v1_geometry.yaml
# Keep the human-auditable threshold manifest beside the geometry asset.
COPY config/quality_gate_thresholds.yaml /app/config/quality_gate_thresholds.yaml
COPY card_rectified_view.png /app/card_rectified_view.png

RUN chown -R engine:engine /app

USER engine
EXPOSE 8572

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8572/readyz', timeout=2).read()"

CMD ["gunicorn", "--bind", "0.0.0.0:8572", "--workers", "1", "--threads", "2", "--timeout", "20", "--graceful-timeout", "10", "--access-logfile", "-", "app:app"]
