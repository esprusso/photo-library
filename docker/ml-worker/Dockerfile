FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    libmagic1 \
    libmagic-dev \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY ml-workers/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy ML worker source
COPY ml-workers/ .

# Create model directory
RUN mkdir -p /models

# Run the worker
CMD ["python", "worker.py"]