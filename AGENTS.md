# AGENTS.md

Guidance for AI coding agents working in this repository. Read this before
making changes. It covers what the project is, how to run it, where things
live, the concepts that hold it together, and how we like changes made.

## What this is

A browser audio visualizer: a lineup of scenes you switch through, each with
selectable variants, that react to live audio (mic input or the bundled track).
Built with **vanilla ES modules and three.js** — no framework, no TypeScript,
no build-step beyond Vite. It deploys to GitHub Pages.

## Commands

```sh
npm install        # install dependencies (Node 22 is what CI uses)
npm run dev        # Vite dev server, HTTPS, bound to all interfaces
npm run build      # production build into dist/
npm run preview    # serve the production build, HTTPS, all interfaces
npm test           # Vitest, one-shot (what CI and reviewers run)
npm run test:watch # Vitest in watch mode
```

Notes:

- **The dev and preview servers are HTTPS on purpose.** Mic capture
  (`getUserMedia`) only works in a secure context, and a phone reaching the
  server over a plain-HTTP LAN IP is not one. `host: true` binds to the LAN so
  you can open it on a phone. Do not switch these to plain HTTP.
- `vite.config.js` sets `base: '/WebGL-AudioViz/'` to match the GitHub Pages
  project URL. Leave it in place.
- `butterchurn` / `butterchurn-presets` are pre-bundled via `optimizeDeps` so
  their UMD/CJS builds resolve to proper ESM default exports in dev too.

## Repo layout

```
index.html            page shell: start overlay, debug canvases, mount points
main.css              all styling
scripts/
  AudioSphere.js      bootstrap: creates App, wires the start-overlay buttons
  app/                the application, framework-free
    App.js            owns the shared renderer, audio, scenes, controls
    SceneManager.js   lazy scene lifecycle + per-frame dispatch
    ControlState.js   single source of truth for scene/variant/drift/debug
    Persistence.js    load/save control state to localStorage
    DriftController.js  auto-advance timer (pause/hidden gating)
    GUIController.js  the control panel
    KeyboardController.js / GestureController.js / InputResolvers.js
    NameFlash.js      transient on-screen scene/variant label
  audio/
    AudioHandler.js   THREE.AudioListener/Audio + default track or mic
    AudioAnalyzer.js  our analysis: spectrum, per-band levels, beat packet
    BeatDetector.js   spectral-flux onset detector
  scenes/
    index.js          SCENE_DEFINITIONS — the lineup, in order
    ThreeVisualizer.js  base class for the three.js scenes
    BlobScene.js, MeshGridScene.js, TunnelScene.js,
    LightFallScene.js, ParticleDanceScene.js   three.js scenes
    ButterchurnScene.js / ButterchurnSupport.js  Milkdrop via Butterchurn
  shaders/            GLSL for the three.js scenes
  config.js           read-only tuning constants
  Utils.js            small shared helpers (clamp, hasWebGL2, ...)
  PostProcessHandler.js / StableAfterimagePass.js   render post-processing
  SlidingAverage.js   rolling average used by the analyzer
tests/                Vitest specs; mirrors the scripts/ tree
public/               static assets (audio, images) copied into dist/
docs/superpowers/     specs/ and plans/ from the design-first workflow
.github/workflows/    deploy.yml — builds dist/ and publishes to Pages
```

## Key concepts

**Entry point.** `index.html` → `scripts/AudioSphere.js` (bootstrap only) →
`scripts/app/App.js`. App owns the one shared `THREE.WebGLRenderer`, the
`AudioHandler`, the `SceneManager`, the `ControlState`, and the input
controllers. It passes a **scene context** to every scene:

```js
{ renderer, width, height, pixelRatio, platformMobile, audioContext, audioNode }
```

**Scenes and SceneManager.** A scene is registered as lightweight data plus a
lazy factory:

```js
{ id, name, variants, randomStartVariant?, create(ctx) => sceneInstance }
```

`SceneManager` creates a scene's heavy object only on first activation, keeps
instances for reuse, and calls `activate / deactivate / resize / update`.
`update(audio, beats, deltaTime)` is forwarded to the **active scene only**.

**ThreeVisualizer.** The base class for our three.js scenes. Each scene owns
its own `THREE.Scene`, camera and optional `PostProcessHandler` on the shared
renderer, so looks cannot leak between scenes. Subclasses override hooks:
`build`, `configurePostProcess`, `onActivate`, `onDeactivate`,
`onUpdate(audio, beats, deltaTime)`, `applyVariant`, `onResize`, `onDispose`.

**Audio pipeline.** `AudioHandler` wraps a `THREE.AudioListener` / `THREE.Audio`
(default looping track, or mic) and exposes `getOutput()`. `AudioAnalyzer`
creates its **own** `AnalyserNode` on that output and produces the normalized
spectrum (`getSpectrum()`, 0..1), per-band levels (`getAverage(idx)`), a global
relative level (`getRelativeTotal()`), and a beat packet (`getBeat()` →
`{ onBeat, strength, location, band }`, computed by `BeatDetector` from
spectral flux). These reach scenes as the `audio` and `beats` arguments.

**Butterchurn is separate.** `ButterchurnScene` is *not* a `ThreeVisualizer`: it
runs its own WebGL2 engine on its own canvas, lazily imported. It is handed the
raw `audioContext` and `audioNode` and does its **own** internal FFT/stereo
analysis — it never consumes our `AudioAnalyzer` output, so don't try to feed it
our spectrum. If WebGL2 is unavailable, activation shows a quiet note.

**State.** `ControlState` is the single source of truth (active scene/variant,
drift settings, debug flags); it persists via `Persistence` (`localStorage`,
key in `config.js`) and drives the UI. `DriftController` advances the selection
on a timer and never ticks while audio is paused or the tab is hidden.

**Config.** All tuning constants live in `scripts/config.js` and are read-only
after import. Mutable per-frame state lives on the owning object, never here.

## Best practices

### Agent workflow

- **Never push directly to `main`.** A push to `main` triggers
  `.github/workflows/deploy.yml`, which builds and publishes to production
  GitHub Pages. Work on a branch and open a PR.
- **Run `npm test` before claiming work is done** and keep the suite green.
  Add or adjust tests when you change behavior — don't just make the suite pass.
- **Verify visual changes in the browser.** Start `npm run dev` (HTTPS) and
  look, rather than assuming a shader/scene renders correctly. The start overlay
  has a "PLAY DEFAULT MUSIC" path for testing without a mic.
- **Follow the design-first flow for non-trivial work.** Specs live in
  `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`. Read the
  relevant one first; write a new spec before building something substantial.
- **Keep changes scoped.** Match surrounding style and don't reformat or
  "improve" unrelated code in the same change.

### Code conventions

- Vanilla **ES modules and three.js** only — no framework, no TypeScript, no
  new runtime dependencies without a good reason.
- Keep the **JSDoc/block file header** at the top of each module: a short
  description of *why* the module exists, and the copyright line.
- **Separate pure logic from rendering** (input resolvers, controllers, state,
  the analyzer) so it can be unit-tested without a GPU or DOM.
- **Tuning constants go in `scripts/config.js`**, read-only after import.
- **Tests mirror `scripts/` under `tests/`.** Vitest defaults to the `node`
  environment; tests that need the DOM opt in with a leading
  `// @vitest-environment jsdom` and mock heavy or browser-only deps
  (e.g. `butterchurn`).

### Adding or changing a scene

- Extend `ThreeVisualizer`; fill in the hooks you need and nothing more.
- **Only render while active** and **dispose what you create** — geometry,
  materials and the post-process composer. The base class handles the rest.
- Register the scene's definition in `scripts/scenes/index.js`; order there is
  the on-screen lineup order. Give it meaningful named variants if it has them.
- Don't spin up additional WebGL contexts casually. There is exactly one shared
  renderer; the Butterchurn scene is a deliberate, isolated exception.
- **Preserve the guards**: the autoplay unlock (`resumeAudioContext()` on the
  start click), the WebGL2 detection/fallback note, and the debug-overlay
  gating (`drawEnabled`) that keeps debug canvases idle while hidden.
