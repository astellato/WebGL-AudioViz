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

## License

MIT, see LICENSE.md for more info.