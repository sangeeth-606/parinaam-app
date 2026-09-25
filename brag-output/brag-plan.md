# Brag Plan: Parinaam

## What is this app?

Parinaam is an offline-first Android field-test recorder for Indian narcotics officers (NDPS): it uses the phone camera plus a printed colour calibration card to measure a presumptive reagent test in CIE-Lab, seals the result into an append-only SHA-256 hash chain that works with zero network, and syncs to a self-hosted PostgreSQL API when a connection exists.

## The angle

**The honesty is the flex.**

Every drug-detection app ever pitched tells you what the substance is. Parinaam is built so it *cannot*. Its outcome vocabulary is a hard code constraint (Constraint 7): `CONSISTENT_WITH_REAGENT_POSITIVE`, `CONSISTENT_WITH_REAGENT_NEGATIVE`, `INCONCLUSIVE`. It will refuse to measure at all if the colour calibration residual breaks its ΔE00 gate, and it will tell a court exactly which byte of which record was touched.

So the video is not "look what it detects." It is "look what it refuses to claim, and how precisely it can prove that." The creative premise is a **forensic instrument film**: treat Parinaam like a piece of lab equipment being introduced to people who will have to defend its output under cross-examination. Restraint is the point. The camera card is beautiful because it is a colour chart. The chain hash is beautiful because it is evidence.

The product's own README has a section literally titled "Honest prototype boundaries." That section is the script.

## Hook (first 2-3 seconds)

A giant, drifting, desaturated **24-patch colour calibration card** in the fixed colorimeter surround (`#101014` panel, `#2A2A31` hairline) — the actual thing the camera stares at. Over it, in institutional condensed type:

> **It refuses to name the substance.**

Then, smaller, in the brand cyan:

> Only what the reagent did.

The hook subverts the entire category in one line, and it is literally true. Nobody scrolls past that.

## Key moments (the middle)

- **The refusal to measure.** Four pipeline stage chips arrive one by one and accumulate — `SRGB → LINEAR`, `BRADFORD ADAPT`, `RP-2 REGRESSION`, `CIELAB / ΔE00` — then a single stamp lands: `RESIDUAL GOOD · ≤ 2.5 ΔE00`, with the real leave-one-out readout `mean 0.82 · max 1.46`. The gate that can *refuse* is the feature.
- **The two registers.** The sealed record shows the officer's plain reading — "Reagent showed the expected colour response" — *above* the exact statutory constant `CONSISTENT_WITH_REAGENT_POSITIVE`, in mono, behind a hairline. One human sentence, one machine string, same record. This is the app's actual design law made visible.
- **The chain hash going into a terminal box.** `SEQ #5`, `PAYLOAD SHA256 4c1e…8a72`, `CHAIN HASH 7f3a…91c4`, with four chain-rail nodes lighting left to right into the previous record's hash.
- **Break it, watch it fail.** A cursor clicks `TAMPER WITH P-3` (red outline, the app's reserved red), one byte changes, and the probe slams to `INTEGRITY FAILURE DETECTED` / `CHAIN BROKEN AT POSITION 3 OF 5`. Then `RESTORE` and the rail goes green again. This is the single most impressive thing the app does, and the app ships it as a *mandated demo*.

## Outro / punchline

The wordmark lands, and under a navy hairline the app's own disclaimer does the talking:

> **PARINAAM**
> `PRESUMPTIVE ONLY — LAB CONFIRMATION REQUIRED`

with three small mono chips: `OFFLINE` · `APPEND-ONLY` · `SELF-HOSTED`. End on the honest boundary, not on a claim. That is the brag.

## User flow worth showing

Entry → key action → result, straight from the app:

1. **Entry** — the duty base: `ON DUTY`, an active case, the primary action `FIELD TEST — P-6`. (Carried as scene 2's framing context, not a scene of its own.)
2. **Key action** — the camera locks the printed calibration card (`Card locked — capture ready`, statutory-amber coaching banner), the 24-patch colour pipeline runs, and the residual gate resolves to `GOOD`.
3. **Result** — the record seals: officer reading, statutory constant, ΔE00, chain hash, into the append-only ledger.
4. **Proof** — the integrity cockpit: verify the chain, then flip one byte and watch the walk break at exactly the right position, then restore.

Scenes 2–4 are this flow. Scene 1 is the hook; scene 5 is the boundary.

## Tone

- Preset: `polished`
- Creative direction: **"Forensic instrument film — an exhibit, not an ad. The product's most unusual feature is that it refuses to guess."**
- Interpretation: Fewer, longer-held scenes; confident slow reveals; generous letter-spacing on chrome; no wipes or flashes. The only hard cut in the video is the tamper break, because that is the only violent act in the story. Em-dash restraint. No exclamation. No "unlock," "supercharge," "streamline." Nothing moves faster than the reading allows.

## Format: landscape — 1920x1080
## Duration: 21.3 seconds


## Visual identity (from the project)

The project ships **two deliberate themes**, and the split is its own design law
(`src/theme/evidence.ts`: "The dark 'Field Instrument' theme … remains the
operational capture chrome; this module governs evidentiary read-out surfaces
only."). The video uses that split as its only structural device:

- **Chrome / capture (scenes 1–2)** — dark "Field Instrument"
  - Background: canvas `#0A101D`, surface sunken `#060B16`, raised `#18243A`
  - Text: `#EEF3F9` primary · `#A6B4C8` secondary · `#74869D` tertiary
  - Accent: `#38BDF8` (brand sky — this project's real colour; cyan-on-dark is intentional here, not a default)
  - Semantic: `#34D399` ok · `#FBBF24` attention · `#F87171` **integrity failure only**
  - Fixed colorimeter surround: panel `#101014`, hairline `#2A2A31` (never themed)
  - Coaching HUD surface: `rgba(217, 119, 6, 0.92)` statutory amber
- **Evidentiary read-out (scenes 3–5)** — light WCAG-AAA "evidence review"
  - Background: `#F8FAFC` canvas, `#FFFFFF` card, `#F1F5F9` card subtle
  - Text: `#0F172A` primary · `#334155` secondary · `#475569` muted
  - Accent: `#1E3A8A` deep navy (13.8:1 on white)
  - Semantic: success `#F0FDF4`/`#16A34A`/`#14532D` · marginal `#FFFBEB`/`#D97706`/`#78350F` · danger `#FEF2F2`/`#DC2626`/`#7F1D1D`
  - Terminal panel (tenderable mono payloads): `#0F172A` fill with `#F8FAFC` text
- **Display font:** `Oswald` (400 / 700) — condensed institutional signage; the register of a spec sheet or an exhibit label, not a marketing headline.
- **Body / data / labels:** `IBM Plex Mono` (400 / 700) — every hash, ΔE00, statutory constant, chip, and micro-label. The app's own typography rule is "utilitarian sans for prose, `monospace` for technical metadata"; the mono carries that register into the video.
  - The Oswald ↔ Plex Mono pairing is chosen because it *is* the product's two-register law: one human voice, one machine voice, in the same frame.
- **Strongest visual element:** the printed 24-patch calibration card in the neutral colorimeter surround, under a cyan reticle — the exact thing the camera is pointed at. Second: the slate terminal box holding a chain hash.
- Both accents are the same family (blue), one value apart — `#38BDF8` on chrome, `#1E3A8A` on paper.

## Share copy (draft)

Introducing Parinaam: an offline field-test recorder that refuses to name a substance.
Phone camera + a printed colour card → CIE-Lab measurement → an append-only SHA-256 chain that shows exactly which byte anyone touched.
Presumptive only. Laboratory confirmation still required.

## Audio direction

- Role: quiet professional bed with sparse, motion-matched accents — an evidence-room register, not a launch trailer.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady, clean; the `polished` pick), volume `0.30`.
- Music treatment: fade in 0.0→0.25s from silence; hold flat at 0.30; ducked slightly under the tamper-break banner (0.30→0.20, 13.5–14.4s) so the impact and the glitch read; fade out 20.7→21.3s under the wordmark. No swell, no riser.
- Music cue guidance: bundled preset read — `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`, 109.96 BPM, planning window 0–25s. Strong cues in window: **10.93s, 13.64s, 15.84s, 17.47s, 18.56s, 19.66s**. Beat grid in window: `0.56, 1.09, 1.64, 2.19, 2.73, 3.27, 3.82, 4.39, 4.91, 5.34, 6.00, 6.56, 7.09, 7.64, 8.19, 8.74, 9.29, 9.83, 10.37, 10.93, 11.46, 12.02, 12.55, 13.11, 13.64 …`.
  - **Beat-grid lock (sequential chips, scene 2):** the four pipeline stage chips snap to consecutive beats from **4.91s → 5.34s → 6.00s → 6.56s** (±0.10s), satisfying the 0.8s reading floor for two-word labels by revealing each on an alternating beat and holding the full stack from 6.56s to 7.70s.
  - **Strong-cue lock 1 (scene 3):** the chain-hash terminal reveal lands on **10.93s** (±0.15s). `// beat-locked: 10.93s`
  - **Strong-cue lock 2 (scene 4):** the `INTEGRITY FAILURE DETECTED` banner slam lands on **13.64s** (±0.15s). `// beat-locked: 13.64s`
  - **Strong-cue lock 3 (scene 5):** the `PARINAAM` wordmark lands on **18.56s** (±0.15s). `// beat-locked: 18.56s`
  - Restraint note: three locks only. The hook (0–3.2s) and the outro copy are deliberately off-grid so the reveal moments feel like arrivals rather than clockwork.
- Audio-reactive treatment: **subtle.** Use per-frame RMS (`assets/music/audio-data.json`, 16 bands, 30fps) to make (a) the cyan glow behind the calibration card and (b) the terminal box's edge glow breathe with overall amplitude, and (c) the evidentiary card's surface tint lift a few percent on bass. Scale swing capped at ~4% on anything containing text. **No waveform bars, no equalizer, no pulse on type.**
- SFX posture: sparse, warm, low-high-frequency-risk. Roughly 9–11 cues across 21.3s.
- Audio-coupled moments:
  - Scene 1 — soft impact on the headline settle (`impact/impactSoft_medium_*`), not on the word-in.
  - Scene 2 — a soft drop per pipeline chip as it appears (`interface/drop_001`/`drop_002`), one medium impact on the `RESIDUAL GOOD` stamp; the `Card locked — capture ready` banner gets no sound (let the visual carry).
  - Scene 3 — soft ticks on the chain-rail nodes; a low bell (`impact/impactBell_heavy_000`) on the chain-hash reveal at 10.93s.
  - Scene 4 — `interface/click_003` at the simulated `TAMPER WITH P-3` click; `interface/glitch_002` on the byte flip; `impact/impactSoft_heavy_003` on the banner slam at 13.64s; a soft bell on `RESTORE` returning the chain to green.

## Storyboard

### Scene 1 — The refusal — 3.5s (0.00–3.50)

Dark chrome (`#0A101D`). Background layer: an oversized 24-patch calibration grid, desaturated toward slate, sitting inside the fixed colorimeter surround (`#101014` panel with a `#2A2A31` hairline), rotated very slightly, drifting ~10px over the scene. A cyan reticle — four corner brackets plus a centre crosshair in `#38BDF8` — breathes open around one patch. Ghost word `PRESUMPTIVE` at ~10% opacity behind, huge, slow drift. A cyan radial glow behind the card breathes with music RMS.

- Overline (mono 400, `#74869D`, tracked, ~24px): `PRESUMPTIVE FIELD TEST RECORD`
- Headline (Oswald 400, ~112px, `#EEF3F9`, mixed case): **It refuses to name the substance.**
- Sub-line (Oswald 400, ~44px, `#38BDF8`): `Only what the reagent did.`

Sequential/interaction: none. The headline fast-in then holds — no per-word gymnastics.
Audio intent: music fades in; one soft warm impact as the headline settles.
Audio-coupled idea: soft impact at the headline's settle, not at its entrance.
Music: `vol-12` fading in from silence.
Transition mood: clean → Scene 2 at 3.20s (crossfade 0.4s, no flash).

### Scene 2 — Capture and calibrate — 5.6s (3.20–8.80)

Dark chrome. The calibration card now sits centre-left, in focus, inside the neutral surround. Four corner brackets snap tighter. Bottom of frame: the statutory-amber coaching banner `rgba(217,119,6,0.92)` with `#FFFFFF` text —
> `Card locked — capture ready`

Right side: four pipeline chips stack downward, each arriving one at a time and staying. Chip structure = mono 400 uppercase label, `#A6B4C8` text, `#18243A` fill, 2px `rgba(255,255,255,0.09)` hairline:

1. `SRGB → LINEAR`
2. `BRADFORD ADAPT`
3. `RP-2 REGRESSION`
4. `CIELAB / ΔE00`

Then a stamp lands across the top of the chip stack — emerald `#34D399` border on a `#064E3B`-tinted fill, mono 700:
> `RESIDUAL GOOD · ≤ 2.5 ΔE00`

and beneath it, mono 400 `#74869D`, ~22px:
> `24 PATCH LOO · mean 0.82 · max 1.46`

Sequential/interaction: **yes** — four chips arrive one by one (beat-grid lock: 4.91 / 5.34 / 6.00 / 6.56s), then the gate stamp lands, then the LOO readout. Full stack holds from 6.56s to 7.70s.
Audio intent: quiet mechanical confidence; four soft placements, one firm stamp.
Audio-coupled idea: soft drop per chip; medium impact on the `RESIDUAL GOOD` stamp; no sound on the coaching banner.
Music: bed continues.
Transition mood: soft (crossfade 0.5s) → Scene 3 at 7.70s — **the palette flips here**, dark chrome to white paper, and the change is the point: instrument → evidence.

  - Scene 5 — `impact/impactBell_heavy_000` on the wordmark at 18.56s; nothing after.
- Restraint rule: audio must never imply this is a consumer product. No whooshes, no risers into the logo, no bright hissy clicks, no stinger. The loudest moment in the video is the tamper break, and it should still feel like a lab, not a trailer.
- SFX analysis: `/home/zape/.agents/skills/brag/assets/sfx/sfx-analysis.md`.


### Scene 3 — Seal the record — 4.4s (8.60–13.00)

Light evidentiary (`#F8FAFC` canvas). One white card (`#FFFFFF`, 2px `#CBD5E1` border, generous padding) anchored left-of-centre, roughly 48% of frame width. Background layer: two navy hairlines (`#1E3A8A` at 12% opacity) running full-bleed horizontally, plus a very faint oversized ghost of the calibration grid. A cyan-to-navy radial lift behind the card breathes gently with RMS.

Card contents, in order:
- Eyebrow (mono 700, `#1E3A8A`, tracked, ~22px): `SEALED RECORD · SEQ #5`
- Officer reading (Oswald 400, ~54px, `#0F172A`): **Reagent showed the expected colour response**
- Hairline rule (1px `#CBD5E1`)
- Statutory constant (mono 400, ~26px, `#475569`): `CONSISTENT_WITH_REAGENT_POSITIVE`
- Terminal box (fill `#0F172A`, mono, ~26px, `#F8FAFC`):
  - `PAYLOAD SHA256   4c1e…8a72`
  - `CHAIN HASH       7f3a…91c4`
- Micro (mono 700, `#475569`): `APPEND-ONLY · PREV HASH LINKED`

Right of the card: a chain rail — five nodes on a hairline, each a small navy ring that fills emerald `#16A34A` one at a time left→right (beats 8.19 / 8.74 / 9.29 / 9.83 / 10.37), with `SEQ 1…5` mono labels beneath them.

Sequential/interaction: **yes** — the five chain-rail nodes fill in sequence; then the terminal box's two hash fields reveal together.
Audio intent: quiet confirmation. The seal is the emotional payoff of the flow, so it gets the biggest clean sound in the video — a low bell, once.
Audio-coupled idea: soft tick per rail node; `impact/impactBell_heavy_000` on the chain-hash reveal (beat-locked 10.93s).
Music: bed continues.
Transition mood: **hard cut** → Scene 4 at 12.10s. The only hard cut in the video; it is the same act as the tamper.

### Scene 4 — Break it, watch it fail — 5.4s (13.00–18.40)

Light evidentiary. An integrity table, five rows, `SEQ # / ID / CHAIN HASH / STATE`. Rows use the app's real shape: mono seq, case ref + package, abbreviated hash, and a small state pill. All five pills read `OK` — `#F0FDF4` fill, `#16A34A` border, `#14532D` text, with a small check glyph. A mono caption above the table: `CHAIN VERIFIED · 5 OF 5`.

A cursor (a crisp navy arrow, drawn as inline SVG — never an emoji) travels to a button below the table:
> `TAMPER WITH P-3`

Red-outlined (`#DC2626` border, `#FFFFFF` fill, `#DC2626` mono 700 text — red is the app's reserved integrity colour and this is exactly its one meaning). Cursor click. Button label flips to `CORRUPTING PAYLOAD…`. Row 3's state pill flips to a red `BROKEN` pill; the row's hash field flickers across two alternate digests (a deterministic 2-frame substitution, not random noise).

Then the upper half of the frame is taken by the danger banner — `#FEF2F2` fill, 2px `#DC2626` border:
- Eyebrow (mono 700, `#B91C1C`, tracked): `INTEGRITY FAILURE DETECTED`
- Title (Oswald 400, ~62px, `#7F1D1D`): **Verification failed — tampering detected**
- Citation (mono 700, `#B91C1C`): `CHAIN BROKEN AT POSITION 3 OF 5`
- Body (Oswald 400, ~34px, `#7F1D1D`): `Every later link also fails to recompute.`
- Micro (mono 400, `#7F1D1D`): `THAT IS THE APPEND-ONLY GUARANTEE`

Then the banner contracts to the lower third, the table returns, and a `RESTORE` button (navy outline) is clicked by the same cursor: row 3 goes back to a green `OK` pill and the caption returns to `CHAIN VERIFIED · 5 OF 5`.

Sequential/interaction: **yes, fully** — simulated cursor travel, click, byte-flip flicker, banner slam, cursor travel, restore click, state rollback.
Audio intent: the one violent moment in the video. A click, a short digital glitch, a heavy soft impact, then calm as it restores.
Audio-coupled idea: `interface/click_003` at the cursor click (~13.15s); `interface/glitch_002` on the byte flip (~13.45s); `impact/impactSoft_heavy_003` on the banner slam (13.64s, beat-locked); `impact/impactBell_heavy_000` on the restore (~15.90s). Music ducks to 0.20 from 13.5s to 14.4s.
Music: bed continues, briefly ducked.

### Scene 5 — The honest boundary — 3.2s (18.10–21.30)

Light evidentiary. Background layer: a faint, oversized ghost of the 24-patch grid at ~8% drifting very slowly, one navy hairline rule above the wordmark, one below, and a soft navy radial lift behind the type that breathes with RMS and then holds still.

- Wordmark (Oswald 700, ~176px, `#0F172A`) — tracked slightly negative: **PARINAAM**
- Under the navy hairline (mono 700, ~28px, `#1E3A8A`, tracked): `PRESUMPTIVE ONLY — LAB CONFIRMATION REQUIRED`
- Three mono chips, evenly spaced, `#F1F5F9` fill with 2px `#CBD5E1` borders, `#334155` text: `OFFLINE` · `APPEND-ONLY` · `SELF-HOSTED`
- A final 1px `#CBD5E1` hairline closes the frame.

Sequential/interaction: yes — the wordmark lands, then the disclaimer line, then the three chips arrive together as one group (not one by one; the video is over).
Audio intent: resolution. One clean low bell as the wordmark lands, then music fades to silence under the last 0.6s.
Audio-coupled idea: `impact/impactBell_heavy_000` at 18.56s on the wordmark. Nothing after.
Music: fades out 20.7→21.30s.
Transition mood: end on held frame; the last 0.4s holds with no motion except the faintest RMS breathe.

**Music mood for this video:** steady, clean, quietly institutional — a bed that would not be out of place in a lab corridor.
**Audio summary:** a quiet professional bed carries all 21.3s; sound marks only four things — the pipeline resolving, the record sealing, the chain breaking, and the name — with the tamper break as the single loudest moment and the last 0.6s falling to silence.

## Voiceover script

Not requested. `--voice` was not passed; this run is entirely voice-agnostic — no narration, no TTS, no ducking for narration.

## Accuracy constraints carried into the composition

These are hard. The video must not contradict them:

- Never state or imply the app identifies a substance. The only outcome language on screen is the app's own: `CONSISTENT_WITH_REAGENT_POSITIVE` and the plain reading "Reagent showed the expected colour response".
- Never imply a government or external case system is contacted. `SELF-HOSTED` is accurate; the API is the team's own.
- Never imply a legal certificate, statutory signature, or laboratory replacement. `PRESUMPTIVE ONLY — LAB CONFIRMATION REQUIRED` appears verbatim.
- Do not describe the device attestation as a statutory digital signature — that phrasing is banned in the project. It is not shown at all in this cut.
- Hash strings on screen are **illustrative format only**, not real digests from the fixture. They are abbreviated in the app's own style (`4c1e…8a72`) and the demo ledger is explicitly synthetic. No real user, officer name, GPS coordinate, or credential appears in the video.
- No real data from `src/demo/demo-dataset.ts` is reproduced beyond the case/package *format*. Officer names, GPS coordinates, kit lot numbers, and UUIDs are omitted or replaced with generic ones.

Transition mood: soft → Scene 5 at 18.10s (crossfade 0.3s).
