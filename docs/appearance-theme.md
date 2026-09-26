# Appearance (light / dark)

Parinaam ships one theme model with two resolved palettes. There is no second
theme system: every screen and shared component reads its colors from the
semantic tokens in `src/theme/theme.ts` through the runtime context.

## How an officer switches appearance

**Settings → APPEARANCE** offers exactly two choices — **Light** and **Dark** —
rendered as a radio group with `sun` / `moon` icons (never colour alone). The
selection is written to the device secure store under
`parinaam.theme.preference` and re-read on the next launch, so the choice
survives a reload, a cold start, and an app restart.

- **Light** is the default for an install that has never chosen, so the app looks
  exactly as it did before the appearance setting existed.
- **Dark** is the institutional deep-navy field-instrument surface.

The stored preference *is* the resolved mode — there is no system/auto
indirection. A value written by an earlier build that offered `system` is
normalised to the light default on the next launch.

`app.json` (`userInterfaceStyle: "automatic"`), the iOS `Info.plist`
(`UIUserInterfaceStyle = Automatic`) and the Android `Theme.AppCompat.DayNight`
resources all follow the app, so the native window, status bar, and the React
Native tree never disagree about the mode.

## Runtime API

```ts
const { mode, theme, preference, setPreference, toggle } = useAppTheme();
const styles = useThemedStyles((theme) => StyleSheet.create({ ... }));
```

- `useAppTheme()` returns the resolved `theme` plus the stored `preference`.
- `useThemedStyles(factory)` memoizes a `StyleSheet` factory against the active
  theme, so styles live next to their component while every colour comes from a
  token.
- Style factories are module-level functions (`const createStyles = (theme: Theme) => StyleSheet.create({...})`).
  A module-scope `StyleSheet.create` cannot see the mode and is rejected by
  `tests/polish/theme-adoption.test.ts`.
- The navigation container and the status bar derive from the same resolved mode.

## Token model

`src/theme/palette.ts` holds raw ramps (`slate`, `navy`, `gold`, `sky`,
`emerald`, `amber`, `red`) and the fixed presentation surfaces
(`colorimeterNeutral`, `statutoryAmber`). `src/theme/theme.ts` maps them to
semantic roles so a component never names a ramp:

| Role group | Examples |
| --- | --- |
| Surfaces | `canvas`, `surface`, `card`, `cardSubtle`, `surfaceSunken` |
| Lines | `borderSubtle`, `border`, `borderStrong`, `scrim`, `overlay` |
| Text | `textPrimary`, `textSecondary`, `textMuted`, `textInverse`, `onAccent` |
| Actions | `brand`, `brandSolid`, `accent`, `accentSurface` |
| Status | `success*`, `marginal*`, `danger*`, `positive*`, `negative*`, `warning*` |
| Badges | `badgeTones.*` derived from the active palette |
| Fixed | `terminal*`, `colorimeter*`, `statutory*`, `cameraBackdrop`, `hud*` |

Dark surfaces use the navy ramp (`#061B2E` canvas, `#0D2945` cards) and the
action/accent ramp is warm gold (`#F5B83D`) — the NCB institutional reading,
without copying any external site or changing the existing layout.

## Deliberately fixed surfaces

These do **not** invert with the mode, because their meaning depends on a fixed
technical context:

- the camera viewfinder letterbox, HUD scrim/glass/reticle and coaching overlay;
- the colorimeter plate and its hairline;
- terminal / certificate output panels and their muted labels;
- the statutory amber notice;
- exported PDF/DOCX/XLSX and map-snapshot colours (they leave the device as files).

## Rules of thumb for new UI

1. Name a semantic role, never a raw hex or a ramp step.
2. Build styles with `useThemedStyles`; do not create styles at module scope.
3. Add a token to **both** palettes when a new role is genuinely needed —
   `ThemeColors` is a single interface, so a missing role is a compile error.
4. Keep meaning multi-modal: colour + icon + text label (see `AGENTS.md`).
5. Do not reintroduce `src/theme/evidence.ts`; it was removed once every runtime
   consumer read from the context.

## Verification

```bash
npm run typecheck
npm run lint
npm test
```

`tests/polish/theme-appearance.test.ts` covers preference resolution, secure-store
persistence/hydration, palette invariants (identical token surface, canvas/card/
accent contrast, fixed surfaces that must not invert), and
`tests/polish/theme-adoption.test.ts` fails the build if a screen or shared
component bypasses the theme context or hardcodes a colour.
