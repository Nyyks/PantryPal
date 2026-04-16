FROM python:3.11-slim

WORKDIR /app

# Install build dependencies for bcrypt
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 5000

# Use preload so import errors show at startup, not per-request
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "--preload", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
