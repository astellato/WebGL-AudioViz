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