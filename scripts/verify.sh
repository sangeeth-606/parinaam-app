#!/usr/bin/env bash
# Parinaam — Independent Standalone Evidence Bundle & Hash Chain Verifier
# Strictly POSIX compliant using GNU coreutils (sha256sum, awk, grep).
# Zero external runtime or library dependencies.

set -eu

BUNDLE_DIR="${1:-.}"

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "[-] Error: Bundle directory '$BUNDLE_DIR' does not exist." >&2
  exit 2
fi

echo "[*] Parinaam Cryptographic Evidence Verifier"
echo "[*] Target bundle: $BUNDLE_DIR"

MANIFEST_FILE="$BUNDLE_DIR/MANIFEST.txt"
CHAIN_FILE="$BUNDLE_DIR/chain.csv"

# 1. Verify MANIFEST.txt if present
if [ -f "$MANIFEST_FILE" ]; then
  echo "[*] Verifying MANIFEST.txt file integrity..."
  FAILED_FILES=0
  TOTAL_FILES=0

  while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    case "$line" in
      \#*|"") continue ;;
    esac

    EXPECTED_SHA=$(echo "$line" | awk '{print $1}')
    REL_PATH=$(echo "$line" | awk '{$1=""; print $0}' | sed 's/^[ \t]*//')
    TARGET_PATH="$BUNDLE_DIR/$REL_PATH"

    TOTAL_FILES=$((TOTAL_FILES + 1))

    if [ ! -f "$TARGET_PATH" ]; then
      echo "[-] Missing file listed in manifest: $REL_PATH" >&2
      FAILED_FILES=$((FAILED_FILES + 1))
      continue
    fi

    ACTUAL_SHA=$(sha256sum "$TARGET_PATH" | awk '{print $1}')
    if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
      echo "[-] Checksum mismatch for $REL_PATH:" >&2
      echo "    Expected: $EXPECTED_SHA" >&2
      echo "    Actual:   $ACTUAL_SHA" >&2
      FAILED_FILES=$((FAILED_FILES + 1))
    fi
  done < "$MANIFEST_FILE"

  if [ "$FAILED_FILES" -gt 0 ]; then
    echo "[-] Manifest verification FAILED: $FAILED_FILES of $TOTAL_FILES files corrupted or missing." >&2
    exit 1
  fi
  echo "[+] Manifest verified: $TOTAL_FILES files match bit-exact digests."
fi

# 2. Verify Cryptographic Hash Chain if chain.csv is present
if [ -f "$CHAIN_FILE" ]; then
  echo "[*] Verifying sequential cryptographic hash chain..."
  GENESIS_HASH="0000000000000000000000000000000000000000000000000000000000000000"
  EXPECTED_PREV_HASH="$GENESIS_HASH"
  RECORD_COUNT=0
  RECORD_INDEX=0

  # Format of chain.csv:
  # seq,record_uuid,prev_hash,payload_sha256,chain_hash,payload_file
  while IFS=',' read -r SEQ UUID PREV_HASH PAYLOAD_SHA CHAIN_HASH PAYLOAD_REL_PATH || [ -n "$SEQ" ]; do
    # Skip header
    if [ "$SEQ" = "seq" ] || [ -z "$SEQ" ]; then
      continue
    fi

    RECORD_COUNT=$((RECORD_COUNT + 1))
    PAYLOAD_PATH="$BUNDLE_DIR/$PAYLOAD_REL_PATH"

    if [ ! -f "$PAYLOAD_PATH" ]; then
      echo "[-] Record index $RECORD_INDEX (UUID: $UUID): payload file '$PAYLOAD_REL_PATH' not found." >&2
      exit 1
    fi

    # Step 2a: Verify link to previous chain hash
    if [ "$RECORD_INDEX" -gt 0 ]; then
      if [ "$PREV_HASH" != "$EXPECTED_PREV_HASH" ]; then
        echo "[-] Broken chain link at record index $RECORD_INDEX (seq: $SEQ, uuid: $UUID):" >&2
        echo "    prev_hash in record:      $PREV_HASH" >&2
        echo "    expected from prev chain: $EXPECTED_PREV_HASH" >&2
        exit 1
      fi
    fi

    # Step 2b: Verify SHA256 of payload file
    ACTUAL_PAYLOAD_SHA=$(sha256sum "$PAYLOAD_PATH" | awk '{print $1}')
    if [ "$PAYLOAD_SHA" != "$ACTUAL_PAYLOAD_SHA" ]; then
      echo "[-] Tampered payload at record index $RECORD_INDEX (seq: $SEQ, uuid: $UUID):" >&2
      echo "    Stored payload_sha256:     $PAYLOAD_SHA" >&2
      echo "    Computed SHA256 of payload: $ACTUAL_PAYLOAD_SHA" >&2
      exit 1
    fi

    # Step 2c: Verify chain_hash = SHA256(prev_hash || payload_sha256)
    COMPUTED_CHAIN_HASH=$(printf "%s%s" "$PREV_HASH" "$PAYLOAD_SHA" | sha256sum | awk '{print $1}')
    if [ "$CHAIN_HASH" != "$COMPUTED_CHAIN_HASH" ]; then
      echo "[-] Corrupted chain hash at record index $RECORD_INDEX (seq: $SEQ, uuid: $UUID):" >&2
      echo "    Stored chain_hash:   $CHAIN_HASH" >&2
      echo "    Computed chain_hash: $COMPUTED_CHAIN_HASH" >&2
      exit 1
    fi

    EXPECTED_PREV_HASH="$CHAIN_HASH"
    RECORD_INDEX=$((RECORD_INDEX + 1))
  done < "$CHAIN_FILE"

  echo "[+] Hash chain verified: $RECORD_COUNT sequential records cryptographically unbroken."
fi

echo "OK"
exit 0
