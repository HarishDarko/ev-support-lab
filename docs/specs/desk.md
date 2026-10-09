# Spec: the Support Desk (`desk/`)

## Product

A walkthrough of one support shift, which is also a working tool. The design is set out in `docs/design/direction.md`. In short:
- **Spine:** "Incident Room" stages (Queue, Triage, Evidence, Verification, Close) with one evidence board that builds up across the stages.
- **"Open the desk":** shows the working console, with the queue table and an inspector panel for every ticket, log line and figure.
- **Visual language:** the calm, editorial "Shift Story" look.
- **Phone:** a single scrolling page.

Hosting is Cloudflare Pages (static build plus Pages Functions), on the existing project `support-desk`, served at supportdesk.harishdarko.com.

## Stack

- React 19, TypeScript (strict), Vite.
- `motion` (Motion for React) for layout and shared-element animation. No other UI framework; CSS with design tokens as custom properties (CSS modules or plain CSS files per component).
- Cloudflare Pages Functions in TypeScript under `desk/functions/`, using `@anthropic-ai/sdk`.
- Tests:
  - Vitest for logic and server functions;
  - Playwright for end-to-end runs against `wrangler pages dev` with `MOCK=1`, so no API spend;
  - `@axe-core/playwright` for accessibility checks.
- ESLint (typescript-eslint) and Prettier. CI runs typecheck, lint, unit tests, build and e2e.

## Phase 1: foundation (this task)

1. **Scaffold** `desk/` with the stack above. `package.json` scripts:
   - `dev`: Vite
   - `pages:dev`: `wrangler pages dev` serving the built `dist` plus functions
   - `build`
   - `test`: Vitest
   - `e2e`: Playwright against `pages:dev` with `MOCK=1`
   - `typecheck`
   - `lint`
2. **Data module** `src/data/`:
   - Port `prototype/public/data/synthetic.js` to typed TypeScript (`synthetic.ts`) with exported types (Ticket, HistoryItem, Runbook, Hero, Verification, and so on).
   - Leave a clearly named seam, `src/data/experiment.ts`, for the lab's generated `experiment.json` (logs, fleet, verification numbers). Until the lab produces it, re-export the current values with a `// TODO(lab)` note.
3. **Server functions**, ported from the current prototype to TypeScript under `desk/functions/`:
   - Sources: `prototype/functions/_lib/ai.js`, `validate.js`, `rules.js`, `steps.js`, and `prototype/functions/api/[step].js`.
   - **Preserve behaviour exactly.** This logic was hardened through nine review rounds. Port it; do not redesign it.
   - Keep: the validation, rules fallback, cost accounting across attempts, rate limiting, `MOCK=1`, the meter-confirmation fields, the clause-aware energy check, the fixed KB meter step, and the `GetTransactionStatus`-aware wording.
   - Make the model IDs configurable via env (`FAST_MODEL`, `DEEP_MODEL`), with defaults `claude-haiku-4-5` and `claude-sonnet-5-5`, so a later scorecard can compare models.
   - Shared logic lives in `desk/functions/_lib/` and must not import from `src/` in a way that breaks the Pages Functions build. If data is needed on both sides, put it in a shared module both can import, e.g. `desk/shared/`.
4. **Tests:**
   - Port every case from the first prototype's attack cases (73 cases) into Vitest, covering validators, rules triage, classify (both paths) and the KB meter step. Add the cases for "closure without runbook" and the energy-negation set.
   - All must pass. Also add a test that rules triage of all 40 tickets is stable: snapshot the `[id, component, action, runbook]` list.
5. **Design tokens:** `src/styles/tokens.css` with the light and dark palettes, type scale, spacing scale, radii, motion durations and easings, as specified in `docs/design/direction.md`. Theme-aware in the artifact shape: light on `:root`, dark under `prefers-color-scheme` guarded by `:not([data-theme="light"])`, and again under `[data-theme="dark"]`.
6. **App shell placeholder:** a minimal page rendering the top strip (name, stage nav, synthetic-data label, theme toggle) and an empty stage area, so the e2e harness has something to run against. One Playwright smoke test (it loads, shows the synthetic label, the theme toggles, no console errors) and one axe check.
7. **CI:** `.github/workflows/desk.yml` runs install, typecheck, lint, unit tests, build and e2e (MOCK=1) on push and PR. Cache npm and the Playwright browsers.

Do not deploy. Do not call the live API: tests use `MOCK=1` or mocked SDK calls only. Never read or print any `.dev.vars` file.

## Phase 2: the experience (later, separate task)

Stages, the evidence board, the console behind "Open the desk", motion, the phone flow, the scorecard view, the cost view and the coverage view, all built on Phase 1.
