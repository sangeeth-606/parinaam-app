# Hyperframes Composition Brief: Parinaam

## Objective

Create a short launch-style brag video for Parinaam — an offline-first Android
field-test recorder for NDPS officers. The video is a **forensic instrument
film**: the product's most unusual feature is that it *refuses* to name a
substance, and can prove exactly which byte of a record anyone touched.

## Output

- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 21.3 seconds (root `data-duration="21.3"`)

## Source Material

- Project root: `/home/zape/Projects/parinaam-app`
- Primary files read:
  - `README.md` (product scope, "Honest prototype boundaries")
  - `src/theme/evidence.ts` (light WCAG-AAA evidentiary theme — token source of truth)
  - `src/theme/theme.ts` + `src/theme/palette.ts` (dark Field Instrument chrome tokens)
  - `src/domain/outcome-copy.ts` (`OFFICER_READING`, `GRADE_COPY`, `abbreviateHash`, `formatIst`)
  - `src/screens/ResultsScreen.tsx`, `src/screens/IntegrityScreen.tsx`, `src/screens/TamperDemoScreen.tsx`, `src/screens/HomeScreen.tsx`
  - `src/components/ui/evidentiary/EvidenceBits.tsx` (two-register rows, terminal boxes, mono metadata)
  - `src/components/ui/evidentiary/LightTabBar.tsx`
  - `src/colour/pipeline.ts` (`RESIDUAL_GOOD_CEIL = 2.5`, `RESIDUAL_DEGRADED_CEIL = 4.0`)
  - `src/crypto/hash-chain.ts` (`chain_hash = SHA256(prev_hash + payload_sha256)`)
  - `src/classify/decision-engine.ts` (Constraint 7 — never assert identity)
  - `src/capture/CoachingOverlay.tsx` ("Card locked — capture ready")
  - `src/demo/demo-dataset.ts` (`PRESUMPTIVE_DISCLAIMER`)
- Product name: **Parinaam**
- Tagline / strongest claim: **it will not tell you what the substance is** —
  only what the reagent did, with a proof of what was recorded.
- Key UI or visual moment to recreate:
  1. The printed **24-patch colour calibration card** in the fixed colorimeter
     surround, under a cyan reticle. Surround panel `#101014`, hairline `#2A2A31`.
  2. The **chain rail** — five `SEQ` nodes on a hairline, filling in sequence.
  3. The **slate terminal box** holding `PAYLOAD SHA256` / `CHAIN HASH`.
  4. The **integrity table** with tri-modal state pills (colour + glyph + label).
  5. The **danger banner** with `INTEGRITY FAILURE DETECTED` / `CHAIN BROKEN AT POSITION 3 OF 5`.
- Copy that must appear verbatim (all from the project's own source):
  - `PRESUMPTIVE FIELD TEST RECORD`
  - `It refuses to name the substance.` *(video line, in the product's register)*
  - `Only what the reagent did.` *(video line)*
  - `Card locked — capture ready`
  - `SRGB → LINEAR` · `BRADFORD ADAPT` · `RP-2 REGRESSION` · `CIELAB / ΔE00`
  - `RESIDUAL GOOD · ≤ 2.5 ΔE00`
  - `24 PATCH LOO · mean 0.82 · max 1.46`
  - `SEALED RECORD · SEQ #5`
  - `Reagent showed the expected colour response`
  - `CONSISTENT_WITH_REAGENT_POSITIVE`
  - `PAYLOAD SHA256   4c1e…8a72`
  - `CHAIN HASH       7f3a…91c4`
  - `APPEND-ONLY · PREV HASH LINKED`
  - `CHAIN VERIFIED · 5 OF 5`
  - `TAMPER WITH P-3` · `CORRUPTING PAYLOAD…` · `RESTORE`
  - `INTEGRITY FAILURE DETECTED`
  - `Verification failed — tampering detected`
  - `CHAIN BROKEN AT POSITION 3 OF 5`
  - `Every later link also fails to recompute.`
  - `THAT IS THE APPEND-ONLY GUARANTEE`
  - `PARINAAM`
  - `PRESUMPTIVE ONLY — LAB CONFIRMATION REQUIRED`
  - `OFFLINE` · `APPEND-ONLY` · `SELF-HOSTED`

## Creative Direction

- Tone preset: `polished`
- Creative direction: **"Forensic instrument film — an exhibit, not an ad."**
- Interpretation: Fewer, longer-held scenes; confident slow reveals; generous
  letter-spacing on chrome; no wipes, no flashes, no snap zooms. The **only hard
  cut** in the video is into the tamper break. Nothing moves faster than the
  reading allows. Em-dash restraint; no exclamation marks; no "unlock,"
  "supercharge," "streamline," "seamless."
- Angle: Every drug-detection app pitched tells you what the substance is.
  Parinaam is built so it *cannot* — its outcome vocabulary is a hard code
  constraint, and its colour-residual gate can refuse to measure at all. The
  brag is "look what it refuses to claim, and how precisely it can prove that."
  Treat it like lab equipment being introduced to people who will have to defend
  its output under cross-examination.
- Hook: a giant drifting, desaturated 24-patch calibration card in its neutral
  surround, cyan reticle breathing around it, and the line **"It refuses to name
  the substance."** followed by the cyan sub-line `Only what the reagent did.`
- Outro / punchline: **PARINAAM** wordmark, then the app's own disclaimer verbatim
  `PRESUMPTIVE ONLY — LAB CONFIRMATION REQUIRED`, then three mono chips
  `OFFLINE` · `APPEND-ONLY` · `SELF-HOSTED`. End on the honest boundary, not a claim.
- Avoid:
  - Generic SaaS language (banned outright)
  - Abstract filler visuals — every frame shows a real UI, real measurement, or
    the real colour card

## Visual Identity

**The project ships two deliberate themes, and the split is its own design law**
(`src/theme/evidence.ts`: "The dark 'Field Instrument' theme … remains the
operational capture chrome; this module governs evidentiary read-out surfaces
only."). The video uses that split as its single structural device: **scenes 1–2
are dark chrome, scenes 3–5 are light paper.** The palette flip at 7.70s is the
one deliberate visual event of the video — instrument → evidence. Do not unify
the two palettes, and do not break into a third.

### Scenes 1–2 — dark "Field Instrument" chrome
- background canvas: `#0A101D`
- background sunken (deepest): `#060B16`
- surface raised: `#18243A`
- text primary: `#EEF3F9` · secondary: `#A6B4C8` · tertiary: `#74869D` · faint: `#4A6285`
- **accent: `#38BDF8`** (brand sky — the project's real brand colour)
- semantic: ok `#34D399` · attention `#FBBF24` · **fail `#F87171` (integrity failure only)**
- hairlines on dark: `rgba(255,255,255,0.05)` / `0.09` / `0.18` — never solid dark borders
- fixed colorimeter surround (never themed): panel `#101014`, hairline `#2A2A31`
- coaching HUD surface: `rgba(217,119,6,0.92)` (statutory amber) with `#FFFFFF` text

### Scenes 3–5 — light WCAG-AAA "evidence review"
- canvas `#F8FAFC` · card `#FFFFFF` · card subtle `#F1F5F9`
- border `#CBD5E1` · border strong `#94A3B8`
- text primary `#0F172A` · secondary `#334155` · muted `#475569`
- **accent: `#1E3A8A`** (deep navy, 13.8:1 on white)
- success: surface `#F0FDF4` · border `#16A34A` · text `#14532D` · icon `#15803D`
- marginal/attention: surface `#FFFBEB` · border `#D97706` · text `#78350F`
- danger: surface `#FEF2F2` · border `#DC2626` · text `#7F1D1D` · icon `#B91C1C`
- terminal panel: fill `#0F172A`, text `#F8FAFC`

### Type
- **Display: `Oswald`** — weights **400 and 700 only**. Mixed case for statements;
  700 for the wordmark and tracked caps micro-chrome.
- **Data / labels / all technical metadata: `IBM Plex Mono`** — weights **400 and 700 only**.
  Every hash, ΔE00 value, statutory constant, chip, eyebrow, and citation uses this.
- The pairing is deliberate and content-derived: it *is* the product's two-register
  law (one human voice, one machine voice, same record). Do not substitute either.
- Tabular numerals on all mono metrics.

### Visual references from the project (in priority order)
1. The 24-patch calibration card inside the neutral colorimeter surround, under
   a cyan reticle with corner brackets and a centre crosshair.
2. The slate terminal box (`#0F172A`) holding `PAYLOAD SHA256` / `CHAIN HASH`.
3. The chain rail — five `SEQ 1…5` nodes on a hairline, filling left to right.
4. The integrity table with tri-modal state pills (colour + glyph + text label).
5. The statutory-amber coaching banner across the bottom of the capture HUD.
6. The legal-ink hairline treatment: 1–2px navy rules, generous negative space,
   no rounded cards beyond the app's own 4–6px radii, no drop shadows on paper.

## Storyboard

Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:

1. **The refusal** — 3.2s (0.00–3.20) — dark chrome; drifting desaturated
   24-patch calibration grid in its neutral surround; cyan reticle breathes.
   Overline `PRESUMPTIVE FIELD TEST RECORD`; headline **It refuses to name the
   substance.**; cyan sub-line `Only what the reagent did.`
2. **Capture and calibrate** — 4.5s (3.20–7.70) — dark chrome; the card in focus
   under tighter corner brackets; statutory-amber banner `Card locked — capture
   ready`; four pipeline chips arrive one by one and accumulate
   (`SRGB → LINEAR`, `BRADFORD ADAPT`, `RP-2 REGRESSION`, `CIELAB / ΔE00`); then
   the emerald stamp `RESIDUAL GOOD · ≤ 2.5 ΔE00` and the mono readout
   `24 PATCH LOO · mean 0.82 · max 1.46`.
3. **Seal the record** — 4.4s (7.70–12.10) — **palette flips to light paper**;
   white evidence card left-of-centre: eyebrow `SEALED RECORD · SEQ #5`, officer
   reading **Reagent showed the expected colour response**, hairline, statutory
   constant `CONSISTENT_WITH_REAGENT_POSITIVE`, slate terminal box with
   `PAYLOAD SHA256   4c1e…8a72` / `CHAIN HASH       7f3a…91c4`, micro
   `APPEND-ONLY · PREV HASH LINKED`. Chain rail right of the card fills
   left→right.
4. **Break it, watch it fail** — 5.4s (13.00–18.40) — light paper; integrity
   table, five `OK` pills, caption `CHAIN VERIFIED · 5 OF 5`; a navy SVG cursor
   travels to `TAMPER WITH P-3` and clicks; the label flips to
   `CORRUPTING PAYLOAD…`; row 3's pill goes red `BROKEN`; then the danger banner
   takes the upper half — `INTEGRITY FAILURE DETECTED` / **Verification failed —
   tampering detected** / `CHAIN BROKEN AT POSITION 3 OF 5` / `Every later link
   also fails to recompute.` / `THAT IS THE APPEND-ONLY GUARANTEE`. Banner
   contracts, `RESTORE` is clicked, row 3 returns to green `OK`, caption returns
   to `CHAIN VERIFIED · 5 OF 5`.
5. **The honest boundary** — 3.2s (18.10–21.30) — light paper; ghost grid +
   two navy hairlines; **PARINAAM** wordmark; `PRESUMPTIVE ONLY — LAB
   CONFIRMATION REQUIRED`; three mono chips `OFFLINE` · `APPEND-ONLY` ·
   `SELF-HOSTED`; closing hairline. Holds to the end.

Total: **21.3s**.

## Shipped-cut reconciliation (plan → composition)

The composition is the authority. Three things moved during the build/audit pass,
and `npx hyperframes check` is clean on the result (0 errors, 0 warnings across
lint, runtime, layout, motion, and contrast):

1. **Duration 20.6s → 21.3s.** The five scene clips ship as
   `s1 0.00–3.50 · s2 3.20–8.80 · s3 8.60–13.00 · s4 13.00–18.40 · s5 18.10–21.30`.
   Scene 4 gained room because the tamper interaction (click → glitch → slam →
   hold → restore → hold) needs to breathe at a legible pace, and scene 5 holds
   a full 3.2s on the wordmark instead of 4.0s of extra stillness. All three
   strong-cue locks (10.93 / 13.64 / 18.56) are unchanged.
2. **The scene-4 alert is a panel below the ledger, not an overlay on it.** The
   first build had the danger banner cover the table, which pushed the table's
   own text under the banner's text. The layout audit flags that as
   `content_overlap`, and the audit re-promotes a *held* overlap from a warning
   to an error. Rather than waive it with `data-layout-allow-overlap`, the
   alert was given its own band (`top: 690px`) beneath the buttons. The
   upside is better than the original intent: the evidence table stays fully
   readable while it fails — the record does not hide when it fails.
3. **Scene 3's right column became a second evidence card** carrying the real
   chain formula from `src/crypto/hash-chain.ts`
   (`payload_sha256 = SHA256(payload_jcs)` /
   `chain_hash = SHA256(prev_hash + payload_sha256)`) under the five-node
   verification rail. The first build had a bare rail floating in dead space.
   Both cards are pinned to `min-height: 506px` so they read as one instrument.

Two smaller audit-driven corrections: the pipeline chip index numerals use
`#7b8ca2` rather than the raw tertiary token `#74869D` (the raw token only
reaches 4.17:1 on `surfaceRaised`; the lifted slate clears AA at 5.0:1), and
GSAP 3.14.2 is vendored to `composition/assets/vendor/gsap.min.js` so the
composition has no runtime network dependency.

  - Any implication the app names a substance, contacts a government system,
    issues a legal certificate, or replaces laboratory confirmation
  - Waveform/equalizer visuals, particle systems, strobing, gradient text,
    left-edge accent stripes, purple/neon accents

## Audio

- Audio role: quiet professional bed with sparse, motion-matched accents — an
  evidence-room register, not a launch trailer.
- Audio arc: music fades in from silence over 0.25s, holds flat through the
  capture and the seal, ducks briefly under the tamper break, resolves on the
  wordmark, and falls to silence under the last 0.6s.
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
  (already copied into `composition/assets/music/`).
- Music treatment: volume `0.30`; fade in 0.00→0.25s; duck to `0.20` for
  13.5–14.4s so the glitch and banner impact read; fade out 20.7→21.30s. No
  riser, no swell, no stinger. Never above 0.5.
- Music cue guidance: bundled preset read —
  `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`.
  Tempo 109.96 BPM. Planning window 0–25s.
  - `strongCues` in window: **10.93, 13.64, 15.84, 17.47, 18.56, 19.66**
  - `beats` in window: 0.56, 1.09, 1.64, 2.19, 2.73, 3.27, 3.82, 4.39, 4.91,
    5.34, 6.00, 6.56, 7.09, 7.64, 8.19, 8.74, 9.29, 9.83, 10.37, 10.93, 11.46,
    12.02, 12.55, 13.11, 13.64 …
  - **Strong-cue lock 1:** chain-hash terminal reveal → **10.93s** (±0.15s).
    `// beat-locked: 10.93s`
  - **Strong-cue lock 2:** `INTEGRITY FAILURE DETECTED` banner slam → **13.64s**
    (±0.15s). `// beat-locked: 13.64s`
  - **Strong-cue lock 3:** `PARINAAM` wordmark → **18.56s** (±0.15s).
    `// beat-locked: 18.56s`
  - **Beat-grid lock:** the four pipeline chips in scene 2 →
    **4.91 / 5.34 / 6.00 / 6.56** (±0.10s), full stack held to 7.70s.
    `// beat-grid: chip 1 at 4.91s, chip 2 at 5.34s, chip 3 at 6.00s, chip 4 at 6.56s`
  - **Beat-grid (non-text accent only):** the five chain-rail nodes in scene 3 →
    8.19 / 8.74 / 9.29 / 9.83 / 10.37. These are glyphs, not sentences, so
    consecutive beats are fine — no reading floor applies.
    `// beat-grid: rail node 1 at 8.19s, … node 5 at 10.37s`
  - Only three strong-cue locks in the whole video. The hook (0–3.2s) and the
    outro copy stay deliberately off-grid.
- Audio-reactive treatment: **subtle.** Per-frame data already extracted to
  `assets/music/audio-data.json` (16 bands + `rms`, 30fps, 3520 frames — the
  composition only needs frames 0–639 for the 21.3s window; trim at embed time).
  Sample it per frame with `tl.call()` in a `for` loop — **not** a single tween.
  - (a) the cyan radial glow behind the calibration card (scene 1) and the
    residue of it in scene 2 → opacity/scale from `rms`, swing ≤ 8%.
  - (b) the slate terminal box's edge glow (scene 3) → opacity from `rms`, swing ≤ 6%.
  - (c) the evidence card's surface tint / the navy radial lift (scenes 3–5) →
    bands[0] (bass) mapped to a subtle background-warmth lift, ≤ 4%.
  - **Never** on any text element, and never scale text. No waveform, equalizer,
    bars, musical notes, particles, or strobing.
- Audio-coupled moments:
  - scene 1 — soft warm impact on the headline settle (~1.15s), not on its entrance
  - scene 2 — a soft drop per pipeline chip (4.91 / 5.34 / 6.00 / 6.56s); one
    medium impact on the `RESIDUAL GOOD` stamp (~6.95s); the coaching banner gets
    no sound
  - scene 3 — a soft tick per chain-rail node (8.19 … 10.37s); a low bell on the
    chain-hash reveal (**10.93s**)
  - scene 4 — click at the `TAMPER WITH P-3` cursor click (~13.15s); glitch on
    the byte flip (~13.45s); heavy soft impact on the banner slam (**13.64s**);
    a soft bell on the `RESTORE` returning the chain to green (~15.90s)
  - scene 5 — a low bell on the wordmark (**18.56s**); nothing after
- SFX selection guidance: warm, low-high-frequency-risk picks only. Card-like
  placements for the accumulating chips (`interface/drop_001`/`drop_002` or
  `casino/card-slide-1`), `interface/click_003` for the simulated click,
  `interface/glitch_002` for the byte flip, `impact/impactSoft_medium_*` for the
  gate stamp, `impact/impactSoft_heavy_003` for the banner slam,
  `impact/impactBell_heavy_000` for the seal/restore/wordmark. Do **not** use
  bright glassy pings, hissy clicks, punch sounds, or error buzzes — wrong
  register for this product.
- SFX analysis guidance: `/home/zape/.agents/skills/brag/assets/sfx/sfx-analysis.md`
  (prefer low/medium `highFrequencyRisk` for every repeated or polished moment).
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, and
  volume based on the animation it actually implemented. Budget: **9–11 cues**.
- Audio files: copy every chosen SFX into `composition/assets/sfx/<family>/`.
  SFX on overlapping tracks need their own ascending `data-track-index` — never
  share an index between overlapping audio. Music sits alone on track 10.


## Hyperframes Instructions

Load `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`,
`hyperframes-keyframes`, and `hyperframes-cli`. `/brag` is its own workflow —
do not enter the `hyperframes` entry-point intent interview and do not route into
its generic promo / launch-video workflow. Prefer native Hyperframes conventions
over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project —
  this composition shows the calibration card, the pipeline chips, the sealed
  record, the chain rail, the terminal box, and the integrity table.
- Keep all text readable in the final render. Reading floors: two-word label
  ≥0.8s settled; full sentence ~0.3s/word.
- Keep the video at 21.3s (within 15–25s).
- Include the music + SFX layer — audio is enabled for this run.
- Treat the `/brag` audio notes as guidance, not a fixed cue sheet. Choose exact
  SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints. Hyperframes decides exact
  animation timing and must ignore a cue that hurts readability or pacing.
- Honor the music treatment: 0.25s fade-in, duck to 0.20 from 13.5–14.4s,
  fade-out from 20.7s to 21.30s.
- Implement the audio-reactive treatment above with per-frame `tl.call()`
  sampling from `assets/music/audio-data.json` (trim to frames 0–618).
- Use local assets for all audio and any runtime/media dependency.
- Run `npx hyperframes check` before render — it is brag's single gate.

The brief is the boundary: if a detail belongs to product positioning, copy,
tone, source material, or selection of moments, `/brag` specified it above. If a
detail belongs to composition implementation — structure, exact animation timing,
mechanics, runtime, linting — Hyperframes decides it.

## Source Traceability

Every claim and every string on screen traces to a file:

| On-screen element | Source |
| --- | --- |
| `PRESUMPTIVE FIELD TEST RECORD` | `README.md`, `src/contracts/field-test-record.ts` |
| "It refuses to name the substance." | `README.md` ("It does not identify a substance"); `src/classify/decision-engine.ts` Constraint 7 |
| `Only what the reagent did.` | `src/domain/outcome-copy.ts` `OFFICER_READING` |
| Calibration card / colorimeter surround | `src/theme/palette.ts` `colorimeterNeutral` |
| `Card locked — capture ready` | `src/capture/CoachingOverlay.tsx` |
| `SRGB → LINEAR`, `BRADFORD ADAPT`, `RP-2 REGRESSION`, `CIELAB / ΔE00` | `src/colour/pipeline.ts` (steps 2, 3, 4, 5) |
| `RESIDUAL GOOD · ≤ 2.5 ΔE00` | `src/colour/pipeline.ts` `RESIDUAL_GOOD_CEIL`; `src/domain/outcome-copy.ts` `GRADE_COPY.GOOD` |
| `24 PATCH LOO · mean 0.82 · max 1.46` | `src/colour/pipeline.ts` step 6 (24 patches); `src/demo/demo-dataset.ts` residual `{mean: 0.82, max: 1.46}` |
| `SEALED RECORD · SEQ #5` | `src/db/ledger-repository.ts`; `src/screens/IntegrityScreen.tsx` seq column |
| `Reagent showed the expected colour response` | `src/domain/outcome-copy.ts` `OFFICER_READING.CONSISTENT_WITH_REAGENT_POSITIVE` |
| `CONSISTENT_WITH_REAGENT_POSITIVE` | `src/contracts/field-test-record.ts` `FieldTestOutcome` |
| `PAYLOAD SHA256` / `CHAIN HASH` | `src/components/ui/evidentiary/EvidenceBits.tsx` `TerminalField`; `src/crypto/hash-chain.ts` |
| `4c1e…8a72` / `7f3a…91c4` | illustrative digest format only — abbreviated per `abbreviateHash`, `src/domain/outcome-copy.ts` |
| `APPEND-ONLY · PREV HASH LINKED` | `README.md`; `src/crypto/hash-chain.ts` |
| `CHAIN VERIFIED · 5 OF 5` | `src/screens/IntegrityScreen.tsx` verification summary |
| `TAMPER WITH P-3`, `CORRUPTING PAYLOAD…`, `RESTORE` | `src/screens/TamperDemoScreen.tsx` |
| `INTEGRITY FAILURE DETECTED`, `Verification failed — tampering detected` | `src/screens/TamperDemoScreen.tsx` `StateBanner` |
| `CHAIN BROKEN AT POSITION 3 OF 5` | `src/screens/TamperDemoScreen.tsx` citation format |
| `Every later link also fails to recompute.` | `src/screens/TamperDemoScreen.tsx` (lightly truncated from the full sentence for the reading floor) |
| `THAT IS THE APPEND-ONLY GUARANTEE` | `src/screens/TamperDemoScreen.tsx` |
| `PRESUMPTIVE ONLY — LAB CONFIRMATION REQUIRED` | `src/demo/demo-dataset.ts` `PRESUMPTIVE_DISCLAIMER`, compressed to a label |
| `OFFLINE` · `APPEND-ONLY` · `SELF-HOSTED` | `README.md` "Guardrails maintained in the code" |
| Dark chrome palette | `src/theme/palette.ts` + `src/theme/theme.ts` |
| Light evidentiary palette | `src/theme/evidence.ts` |
| Three-state colour law (red = integrity only) | `src/theme/palette.ts` header; `src/theme/evidence.ts` |

  - Redesigning the product's look — use the project's exact tokens
