#!/usr/bin/env python3
"""
Parinaam — Automated Data Leakage Guard (CI Validation)
Governed by spec/04-phase-3-classification.md (Task 3.2 & Milestone M3.2).

Enforces:
1. Strict session-level and physical-sample-level data partitioning.
2. ZERO overlap of session_id between train, calibration, and test splits.
3. ZERO overlap of physical_sample_id between train, calibration, and test splits.
4. Total sample count >= 1,000.
"""

import json
import sys
from pathlib import Path


def check_data_splits(dataset_path: Path) -> bool:
    if not dataset_path.exists():
        print(f"[FAIL] Dataset file not found: {dataset_path}", file=sys.stderr)
        return False

    with open(dataset_path, "r", encoding="utf-8") as f:
        records = json.load(f)

    total_count = len(records)
    print(f"Loaded {total_count} swatch capture records.")

    if total_count < 1000:
        print(f"[FAIL] Minimum 1,000 swatch captures required, found: {total_count}", file=sys.stderr)
        return False

    splits = {"train": set(), "calibration": set(), "test": set()}
    sample_splits = {"train": set(), "calibration": set(), "test": set()}

    for r in records:
        split = r.get("split")
        session_id = r.get("session_id")
        sample_id = r.get("physical_sample_id")

        if split not in splits:
            print(f"[FAIL] Invalid split '{split}' in record {r.get('capture_id')}", file=sys.stderr)
            return False

        if not session_id or not sample_id:
            print(f"[FAIL] Missing session_id or physical_sample_id in record {r.get('capture_id')}", file=sys.stderr)
            return False

        splits[split].add(session_id)
        sample_splits[split].add(sample_id)

    # Check session overlap
    train_calib_sessions = splits["train"].intersection(splits["calibration"])
    train_test_sessions = splits["train"].intersection(splits["test"])
    calib_test_sessions = splits["calibration"].intersection(splits["test"])

    if train_calib_sessions:
        print(f"[FAIL] Session leakage between train and calibration: {train_calib_sessions}", file=sys.stderr)
        return False

    if train_test_sessions:
        print(f"[FAIL] Session leakage between train and test: {train_test_sessions}", file=sys.stderr)
        return False

    if calib_test_sessions:
        print(f"[FAIL] Session leakage between calibration and test: {calib_test_sessions}", file=sys.stderr)
        return False

    # Check physical sample overlap
    train_calib_samples = sample_splits["train"].intersection(sample_splits["calibration"])
    train_test_samples = sample_splits["train"].intersection(sample_splits["test"])
    calib_test_samples = sample_splits["calibration"].intersection(sample_splits["test"])

    if train_calib_samples or train_test_samples or calib_test_samples:
        print(f"[FAIL] Physical sample leakage across splits detected!", file=sys.stderr)
        return False

    print("[PASS] Milestone M3.2 satisfied: Zero session or sample leakage across splits.")
    print(f"  Train: {len(splits['train'])} sessions, {len(sample_splits['train'])} physical samples")
    print(f"  Calibration: {len(splits['calibration'])} sessions, {len(sample_splits['calibration'])} physical samples")
    print(f"  Test: {len(splits['test'])} sessions, {len(sample_splits['test'])} physical samples")
    return True


if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parent.parent
    dataset_file = repo_root / "data" / "swatch-captures" / "swatches.json"
    ok = check_data_splits(dataset_file)
    sys.exit(0 if ok else 1)
