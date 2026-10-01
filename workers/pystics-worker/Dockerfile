FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    PYSTICS_CALIBRATION_ROOT=/app/calibration

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./app.py
COPY calibration ./calibration

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
