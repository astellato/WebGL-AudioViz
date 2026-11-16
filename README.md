# WebGL Audio Visualizations

AudioViz experiments for the web browser.  Made with [three.js](https://github.com/mrdoob/three.js/).

## Usage

```sh
npm install
npm run dev     # local dev server with hot reload
npm run build   # production build into dist/
npm run preview # serve the production build locally
```

Deployment is handled by `.github/workflows/deploy.yml`, which builds
`dist/` and publishes it to GitHub Pages on every push to `main`.
(The old Jekyll `_config.yml` / `.nojekyll` workflow is gone; the build
emits its own `.nojekyll` from `public/`.)

Live version available [here](https://astellato.github.io/WebGL-AudioViz/).

If on PC, press SHIFT for audio analysis debug display.

## Audio analysis

`scripts/audio/AudioAnalyzer.js` reads the FFT as float dB (bytes clip at -30 dB
and quantize to 8 bits, which flattens the loud low end) and derives log spaced
band levels, each normalized against its own decaying peak so any source and
gain works.

`scripts/audio/BeatDetector.js` measures spectral flux in dB per sub band
against a fixed time ago, so a track 30 dB down detects the same beats, and
estimates the tempo (BPM) by autocorrelating the flux envelope with a comb
score. Every time constant is in seconds, so results do not depend on frame
rate.

`FFT_SIZE` is 2048: at 512 the bins are ~94 Hz wide and the lowest bands and the
beat detector lose the kick drum entirely.

An offline harness replays audio through the real analyzer in Node, with a
simulated `AnalyserNode` and a jittered frame clock, and checks the synthetic
tracks against known beat times:

```sh
npm run audio:test                          # synthetic tracks + the default track
npm run audio:test -- --track song.mp3      # report on another file (needs ffmpeg)
npm run audio:test -- --no-track            # synthetic tracks only
```

It exits non-zero when a synthetic check fails, so it can gate a change.

## Controls

| Input | Action |
| --- | --- |
| Left / Right | previous / next scene (wraps) |
| Up / Down | previous / next variant of the current scene (wraps) |
| `D` | toggle Drift |
| `H` | open / close the control panel |
| Shift | toggle the audio debug overlay (kept as an alias) |
| Space | pause / resume audio |
| Enter | restart the track |
| 1–4 | performance Stats panels |
| Mobile: horizontal swipe | previous / next scene |
| Mobile: vertical swipe | previous / next variant |
| Mobile: corner button | open / close the control panel |

Drift is project-wide and off by default: every **60s** it advances the
selection, scope **visualizers**. A manual switch turns Drift off until you
re-enable it, and it never advances while audio is paused or the tab is hidden.
The control panel (`H`, or the corner button on touch devices) also holds the
Drift speed/scope and the two debug toggles.

## License

MIT, see LICENSE.md for more info.