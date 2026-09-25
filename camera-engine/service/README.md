# Parinaam camera-engine image analysis service

This directory contains the Docker-only HTTP adapter for the camera-engine
image pipeline. The service has no database dependency and does not write
annotated images or any other runtime artifacts.

## Contract

- `GET /livez` — process liveness.
- `GET /readyz` (also `/health`) — assets/import readiness and geometry digest.
- `POST /v1/analyze` — exactly one `image` part (JPEG or PNG), or a raw JPEG/PNG
  body. The response is `parinaam-camera-engine-v1` JSON.

The request may include a `reagent` form field or `X-Reagent` header. The
current documented profile is the `duquenois_levine` mock profile. Unknown
reagents receive an explicit `UNSUPPORTED_REAGENT_PROFILE` result rather than
an invented classification.

## Validation boundary

`camera-engine/card_v1_geometry.yaml` is the canonical card/profile input. Its
reference Lab values are scanner-derived and explicitly not
spectrophotometer-grade. The profile is `PENDING_VALIDATION`; the service
blocks classification by default. Set `CAMERA_ENGINE_DEMO_MODE=1` only for the
explicitly labelled SIH mock-print demo. In that mode, the response retains
`profile.status`, `profile.demo_mode`, and
`classification.confidence_uncalibrated`, and the mobile app must mark the
record as demo data.

The documented test swatch ROI is outside the `1000x800` rectified card artifact.
A calibration-card image without the external swatch therefore returns an
honest `TEST_SWATCH_OUTSIDE_FRAME` / `INCONCLUSIVE` result. Do not substitute a
calibration patch or fabricate a colour.

The service uses the degree-2 Finlayson–Mackiewicz–Hurlbert root-polynomial
basis in D50 XYZ (`[r, g, b, √rg, √rb, √gb]`) over all 16 patches. Patch
MAD filtering uses the documented `3.0` robust-sigma cutoff with the
`0.6745` MAD-to-sigma divisor. The calibration-fit mean residual gate is
`5.0 ΔE00`, matching `config/quality_gate_thresholds.yaml`; it is an
engineering default, not a scientifically validated threshold. The maximum
residual is returned for audit and remains visible in the app. A result that
is `DEGRADED` or carries `confidence_uncalibrated` must not be presented as
laboratory-grade.

## Local Docker deployment

For the normal Parinaam app workflow, use the root launcher:

```sh
npm run app:go   # Expo Go on a phone; starts db, server, and camera-engine
npm run app      # custom development client
```

The launcher waits for `/readyz` before starting Metro. To operate the engine
alone, use the explicit Compose command from the repository root:

```sh
docker compose up -d camera-engine
curl http://127.0.0.1:8572/readyz
curl -F "image=@camera-engine/photo-phone-camera/IMG_20260916_065416.jpg.jpeg" \
  -F "reagent=duquenois_levine" http://127.0.0.1:8572/v1/analyze
```

The service binds to `127.0.0.1` by default. Set `ENGINE_BIND=0.0.0.0` only for
a trusted local LAN/hotspot and restrict the host firewall accordingly. The
Android emulator reaches the host at `10.0.2.2:8572`; a physical device needs
an explicitly configured LAN URL (or `adb reverse` and a loopback URL).

The checked-in phone fixture `IMG_20260916_065416.jpg.jpeg`
(SHA-256 `95a2896078c5…`) produces a `DEGRADED` calibration in explicit demo
mode and a legal `CONSISTENT_WITH_REAGENT_NEGATIVE` event. The later
`IMG_20260916_071000.jpg.jpeg` fixture (SHA-256 `062a7819eb9c…`) is also a
valid card photograph, but its measured calibration mean residual is above the
provisional 5.0 gate; the service returns `INCONCLUSIVE` with
`CALIBRATION_RESIDUAL_HIGH` and does not classify it. This is intentional
fail-closed behavior, not a reason to lower the gate per image.

## Provenance and no-online-platform rule

The image is self-hosted: all Python wheels and the YAML asset are baked at
build time, and the process has no network calls at runtime. The service does
not require an online platform or API key.
