# Chart Tricks

Same data, different impression. Compare a fixed reference with an adjustable chart, then change the range, choose a mean or median guide, and hide flagged outliers. The values and statistics stay unchanged.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/desktop-dark.png">
  <img alt="Chart Tricks with a fixed reference, adjustable comparison and theme selector" src="docs/media/desktop-light.png">
</picture>

## Try the comparison

Choose a dataset, adjust the Modified range, then compare the impressions above the plots. Mean and Median always use all source values. Export a labelled image when you find a useful comparison.

**Theme** offers System, Light and Dark. System follows your browser's appearance setting. Your choice stays in this browser's local storage. Reset changes the comparison controls and keeps your theme. Export uses the current theme.

## Run locally

Use Node.js 22.18 or newer and npm.

```sh
npm ci
npm run dev
```

```sh
npm test          # Statistics, transformations, reset, themes and export content
npm run typecheck
npm run build    # Type checking and production bundle
npm run preview  # Serve the built app locally
```

The stack is TypeScript, Vite and native SVG. Vite provides development and static builds. SVG gives precise chart geometry that the app and exporter share. Native Canvas converts the export to PNG. Node's built-in test runner handles the isolated numerical logic. There are two development dependencies and no runtime dependencies, external fonts, backend, accounts or analytics.

## Data and rules

All datasets are synthetic, authored for this project to illustrate particular patterns. They are not measurements from a real cafe, retailer or survey. Exact values are in `src/model.ts` and the app's **Source data and rules** section.

| Dataset | Source values | Unit | Reference range | Reset range |
| --- | --- | --- | --- | --- |
| Cafe revenue, Jan to Jun | 4800, 4900, 4850, 5000, 5050, 5150 | EUR | 0 to 6000 | 4500 to 5500 |
| One large order, orders 1 to 8 | 24, 26, 27, 28, 29, 30, 31, 180 | EUR | 0 to 200 | 0 to 40 |
| Survey scores, groups A to H | 72, 79, 76, 81, 78, 75, 80, 77 | % | 0 to 100 | 70 to 85 |

- The mean is the arithmetic average. The median is the middle sorted value, or the average of the two middle values for an even count. Both always use every source value.
- Q1 and Q3 are the medians of the lower and upper halves. For an odd count, exclude the middle value from both halves. A singleton has Q1 = Q3 and IQR = 0.
- IQR = Q3 − Q1. Flag values strictly below Q1 − 1.5 × IQR or above Q3 + 1.5 × IQR. Equality with a fence is not flagged. The large-order example flags only 180 EUR: Q1 = 26.5, Q3 = 30.5, fences = 20.5 and 36.5.
- **Hidden** points meet the outlier rule and the checkbox hides their markers. **Clipped** points remain visible but fall outside the chosen range. Counts do not overlap. Boundary triangles identify clipping and do not represent actual point positions.
- Both charts use linear scales and identical observation order. The app connects cafe values in month order. Unordered observations use dots. Bounds change display positions, never source values or summaries. A guide outside the range gets a text notice instead of a false edge position.

The range slider moves between the full reference and the tighter preset. Custom fields accept finite bounds from −1,000,000 to 1,000,000, with a minimum span of 0.01. Invalid fields keep the last valid chart and disable export until you fix them. **Reset** keeps the current dataset and restores its tighter range, Median and visible outliers. Changing dataset starts its preset. Reloading starts Cafe revenue and keeps only your saved theme preference.

## Export and limitations

**Export image** downloads a 2880-pixel-wide PNG in the current theme. It includes both charts, ranges, units, selected guide, mean, median and visibility counts. It also includes affected values, the outlier rule, explanations and source values. Export uses its own readable comparison layout rather than a screenshot of the controls.

A tighter axis can reveal small differences and also make them look larger. Hiding a flagged value can reveal a cluster while obscuring part of the distribution. The app explains these trade-offs. An outlier flag is not evidence of an error. Other quartile conventions can produce different fences. These small synthetic examples illustrate presentation choices, not inference, uncertainty or causation. The app supports only linear scales.

The test suite checks statistics, display transformations, reset and export content. Theme tests check preference resolution, readable chart contrast, and identical data, statistics and coordinates in both themes. Verification does not cover physical phones, Safari, Firefox or screen reader sessions.

## Static hosting

Run `npm ci` and `npm run build`, then host **only `dist/`** on GitHub Pages or another static host. The configured relative asset base supports a project subdirectory. The app needs no credentials, server functions or route rewrites. For a build service, use build command `npm run build` and output directory `dist` with a supported Node version.

For GitHub Pages, select **GitHub Actions** under the repository's **Settings → Pages → Source**. The included workflow tests and builds the project before it deploys `dist/` from `main`. Pull requests run checks without deployment. See [GitHub's workflow instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Release packages and privacy

After a production build, run `npm run package`. This optional step needs Python 3 and uses only its standard library. It creates source and static ZIP files plus `SHA256SUMS` under `release/`. The static ZIP contains files ready for a static host. The source ZIP contains the app, tests, configuration, documentation and build workflow.

Packaging uses an explicit file allowlist and rejects unexpected files or symbolic links. It checks published text for common credential formats, private keys, personal email addresses and local home paths. This check reduces accidental disclosure but cannot identify every possible secret. Review new publication files before release.

Local design history, agent notes, browser traces, generated packages, dependencies and environment files stay outside the publication allowlist. Documentation screenshots display only the app. The app has no network APIs, analytics or remote fonts. The browser stores only the theme preference locally and creates each PNG export.
