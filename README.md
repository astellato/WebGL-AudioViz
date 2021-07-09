# WebGL Audio Visualizations

AudioViz experiments for the web browser.  Made with [three.js](https://github.com/mrdoob/three.js/).

Audio analysis is naive, no beat detection.  We measure the peaks of each smoothed FFT bin and return a normalized relative value at each frame corresponding from no sound to the highest sound sampled (0-1).  This system handles signals with various levels of gain extremely well.

## Usage

Download repo and run.

## License

MIT, see LICENSE.md for more info.