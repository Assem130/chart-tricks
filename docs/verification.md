# Version 1.1.0 verification

These checks cover the discovery update prepared for version 1.1.0. Earlier release archives remain preserved.

## Passed

- Production Chromium at 1440 × 1000, 390 × 844, 390 × 668 and 320 × 568.
- Interpret then reveal, all three experiments, next experiment and immediate free exploration.
- Keyboard impression radios, Tab and Enter reveal, slider Home/End/arrows and mean/median radios. Phone reveal moves focus to its visible Modified button.
- Phone chart switches retain settings. Changing a control returns to Modified. Zoom, hiding, average selection and expanded exact bounds are visible with the chart at the tested sizes, including an empty 320-pixel view.
- Reset restores the current question or exploration preset. Theme survives reset and reload. System follows live browser appearance changes.
- Blank, equal, reversed and oversized bounds retain the last valid chart and disable export. Correcting them recovers. A valid minimum span of 0.01 may show an empty range with direction triangles and full statistics.
- Sampled reveal geometry while moving and after settling. A forced reduced-motion preference tested the no-animation code and authored CSS branches. The override was then removed.
- Three actual PNG downloads: cafe zoom in Light, hidden large order with Mean in Dark, and an empty custom range. Each is 2880 pixels wide. Pixel checks matched 35 point centers and 8 clipping triangles, plus backgrounds and hidden-marker absence. Labels, all source values and disclosures were visually inspected.
- A simulated image-render failure showed retry feedback and restored the export button. Retrying produced a real PNG.
- Nineteen behavior checks, type checking and the production build passed. Independent verification passed 219 data and presentation cases with unchanged observations and statistics.
- Packaging passed allowlist, sensitive-text and ZIP integrity checks in a disposable copy. The 24-file source ZIP includes the new discovery module. An extracted source copy rebuilt byte-for-byte identical output using the existing installed development dependencies. Prior release archives and the preserved source checkout stayed unchanged.
- Independent visual review found a median-label collision on the smallest hidden-order chart. The label now sits below narrow plots while its dashed guide stays exact. Browser measurements and regression checks passed. The reviewer returned `ship` for the corrected finding.

## Limits

Phone sizes use Chromium viewport resizing, which retains the desktop browser agent. The checks do not cover physical touch, the phone keyboard, Safari, Firefox or screen reader sessions. Another session owned the Android emulator, so it remained untouched. iOS Simulator was unavailable on Linux. The reduced-motion test forced the browser branch. It did not change an operating-system preference.

Browser download restrictions can affect delivery. The statistical examples cover presentation, not inference, uncertainty or causation. Quartile conventions can differ. All scales are linear.
