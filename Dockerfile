# Parinaam — Offline Drug Field Testing Application
# Multi-platform Docker Container (Linux / macOS / Windows)
FROM node:22-bookworm-slim

# Install system dependencies:
# - python3: For scripts/check-data-split.py
# - openssl: For scripts/verify.sh cryptographic attestation verification
# - bash, coreutils, curl: Essential shell utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    openssl \
    ca-certificates \
    curl \
    bash \
    git \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package.json ./

# Set environment variables for cross-platform deterministic operation
ENV NODE_ENV=development \
    EXPO_OFFLINE=1 \
    CI=1 \
    PORT=8081

# Copy source code, configurations, data, and test suites
COPY . .

# Ensure shell scripts have execute permissions
RUN chmod +x scripts/*.sh 2>/dev/null || true

# Default exposed ports:
# 8081  - Metro bundler & React Native for Web
# 19000 - Expo development server
# 19006 - Expo web fallback port
EXPOSE 8081 19000 19006

# Default command: run full test suite across all phases
CMD ["npm", "test"]
