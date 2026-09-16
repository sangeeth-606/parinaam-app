#!/usr/bin/env bash
set -e

# ==============================================================================
# Parinaam — Cross-Platform Docker Automation CLI
# Supports Linux (Arch, Ubuntu, Fedora), macOS (Intel/ARM), Windows (WSL2/GitBash)
# ==============================================================================

COMMAND="${1:-start}"

function print_header() {
  echo "=================================================================="
  echo "  Parinaam — Field Testing Verification & Simulation System       "
  echo "  100% Offline Forensic Architecture | SIH 2026 Problem 26231    "
  echo "=================================================================="
}

case "$COMMAND" in
  start|up)
    print_header
    echo "[*] Starting Parinaam engine sandbox (verification container)..."
    echo "[*] API port 8787 only when running: npm run server (see server/README.md)"
    docker compose up -d
    echo "[✓] Services started successfully in background!"
    echo "    Run './scripts/docker-run.sh logs' to view output"
    echo "    Run './scripts/docker-run.sh stop' to shutdown"
    ;;

  stop|down)
    print_header
    echo "[*] Stopping Parinaam Docker stack..."
    docker compose down
    echo "[✓] All containers stopped and removed."
    ;;

  test)
    print_header
    echo "[*] Running full automated test suite inside Docker..."
    docker compose run --rm parinaam npm test
    ;;

  verify)
    print_header
    echo "[*] Running cryptographic evidence & hash chain verification..."
    docker compose run --rm parinaam bash scripts/verify.sh
    ;;

  data-split)
    print_header
    echo "[*] Verifying zero dataset leakage across train/calibration/test splits..."
    docker compose run --rm parinaam python3 scripts/check-data-split.py
    ;;

  all-checks)
    print_header
    echo "[1/3] Running unit & integration tests..."
    docker compose run --rm parinaam npm test
    echo ""
    echo "[2/3] Checking dataset splits..."
    docker compose run --rm parinaam python3 scripts/check-data-split.py
    echo ""
    echo "[3/3] Verifying cryptographic seals & hash chain..."
    docker compose run --rm parinaam bash scripts/verify.sh
    echo ""
    echo "[✓] All 3 verification gates passed inside Docker!"
    ;;

  logs)
    docker compose logs -f
    ;;

  *)
    echo "Usage: $0 {start|stop|test|verify|data-split|all-checks|logs}"
    exit 1
    ;;
esac
