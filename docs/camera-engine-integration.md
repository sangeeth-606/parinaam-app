# Camera-engine integration

## What is connected

The officer app's capture step now has one real path:

1. `expo-camera` requests permission and captures one JPEG/PNG from the device.
2. The exact camera URI is sent as multipart bytes to the local Docker service.
3. The service performs ArUco detection, homography, 16-patch sampling, glare/blur checks, root-polynomial CIELAB correction, and CIEDE2000.
4. The service returns a versioned result. The app's adapter translates only the three legal app outcomes and refuses raw engine labels.
5. The exact photo is copied to the app's append-only evidence store. Its SHA-256 must equal the engine's `image.sha256` before a record can be sealed.
6. The existing sealed field-test payload, hash chain, device attestation, outbox, and API sync continue unchanged. Full engine diagnostics are retained in the local append-only `camera_engine_result` projection.

There is no gallery/file-picker input and no fallback to random/synthetic capture data. If the Docker service is unreachable, the camera URI remains available in the capture screen and the UI asks for retry/recapture; a record is never sealed from a failed response.

## One-command local runtime

The normal app command starts the complete self-hosted stack and waits for the
engine before opening Expo:

```sh
npm run app:go   # physical phone using Expo Go
npm run app      # custom native development client
```

The launcher starts `db`, `server`, and `camera-engine`, checks their health
endpoints, injects the host LAN URLs into Expo, and then starts Metro. A manual
`docker compose up -d camera-engine` is only for engine-only administration or
diagnostics.

The service listens on host port `8572` by default. It is separate from the
Parinaam API on `8571`, but it is part of the same one-command application
workflow. An Expo `--tunnel` publishes only Metro; it does not publish or
replace the camera-engine URL. The phone must still be able to reach `8572` and
`8571` through emulator networking, `adb reverse`, or a trusted LAN.

- Android emulator: the launcher supplies the host LAN URL; direct Metro runs
  default to `http://10.0.2.2:8572`.
- Physical phone over USB: use `adb reverse tcp:8572 tcp:8572` and a loopback
  URL, or use the launcher's trusted-LAN binding and host LAN IP.
- LAN binding is for a trusted local network only. Restrict the host firewall to
  the trusted subnet; do not expose this unauthenticated image endpoint publicly.
- Android cleartext is enabled in the prototype build for local HTTP. Do not use
  this configuration for a public deployment; use HTTPS at a local reverse proxy
  or a secured service endpoint.

## Card/profile provenance

The service uses `camera-engine/card_v1_geometry.yaml` as the single image input. The active 100 × 80 mm geometry, four `DICT_4X4_50` markers, sixteen patch coordinates, and external test-swatch ROI at `x=149..161 mm, y=31..43 mm` are used. The ROI was checked against the supplied phone-photo fixtures. The older `x=105/y=34` text in generated research profiles is stale and is not used.

The card Lab values are scanner-derived (averages from flatbed scans, with substantial uncertainty), not spectrophotometer measurements. The mock kit profile is `PENDING_VALIDATION`. By default, classification is blocked and the app receives `INCONCLUSIVE`; the app never presents that profile as laboratory validated. `CAMERA_ENGINE_DEMO_MODE=1` enables only the explicitly labelled printed P13/P14 mock demonstration. Such records are marked `is_demo`, retain `profile.status` and `confidence_uncalibrated`, and must not be described as chemical identification.

`card_rectified_view.png` is a diagnostic 1000 × 800 image of the card alone. Its external swatch ROI is outside that image, so it is not a complete test input. The service rejects it with `TEST_SWATCH_OUTSIDE_FRAME` and an honest `INCONCLUSIVE` result before any classification.

The checked-in phone fixture `IMG_20260916_065416.jpg.jpeg`
(SHA-256 `95a2896078c5…`) is the reproducible demo input: its 16-patch
calibration is `DEGRADED` but passes the provisional mean residual gate, and
explicit demo mode returns only the legal negative outcome. The later
`IMG_20260916_071000.jpg.jpeg` (SHA-256 `062a7819eb9c…`) is a separate valid
photo whose residual is above the provisional gate; it intentionally returns
`CALIBRATION_RESIDUAL_HIGH` and `INCONCLUSIVE`. These are fixture-specific
measurements, not a reason to tune the threshold per image.

The engine's quality gates are intentionally independent per image. In the supplied
fixture set, `070804` exceeds the 5 MiB upload bound, `070951` fails the blur
gate, and `070851` is a usable but degraded/negative result. These outcomes
are recorded as limitations, not hidden by calibration tuning.

For reproducibility, the current replay uses these checked-in SHA-256 values:

| asset | SHA-256 |
| --- | --- |
| `camera-engine/service/analyzer.py` | `86c4bf5666d6c3a10da658280f840bb3aa9359b98bfb4bc42391625464213463` |
| `camera-engine/card_v1_geometry.yaml` | `2e285d4e1d54474a29a24f8d536b0a03f963b8dbe863776f290c62546b85c141` |
| `camera-engine/config/quality_gate_thresholds.yaml` | `0657cb4f72fa6ca62c0c316e6940367c9c4c16801bbb8e88bcdbd190121886bb` |
| `IMG_20260916_065416.jpg.jpeg` | `95a2896078c5a6825a43c3e751594f19e9943e4ee3ef9c8ad4c0d0135bf30913` |

The current source produces mean residual `4.17864827 ΔE00`, maximum
residual `12.57181994 ΔE00`, and the legal demo negative outcome. These values
are a replay of the checked-in fixtures, not a claim of physical or laboratory
validation.

## Tests

```sh
npm run typecheck
npm test
node --experimental-strip-types --test \
  tests/capture/camera-engine-adapter.test.ts \
  tests/capture/camera-engine-client.test.ts
docker compose config --quiet
docker compose --profile test run --rm camera-engine-test
```

The engine image has a separate build context, pinned runtime dependencies, a non-root user, read-only root filesystem, bounded upload/pixel/worker settings, and a health/readiness endpoint. It has no runtime network dependency.
