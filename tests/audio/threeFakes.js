/*
  Shared three.js fakes for audio tests.

  AudioHandler builds its graph from THREE.AudioListener / THREE.Audio, so the
  tests need a controllable stand-in that records connections. Kept in its own
  module so the vi.mock factory can import it (factories are hoisted above the
  test file's own declarations).
*/

export const contexts = [];

class FakeParam {
  constructor() { this.value = 1; }
  cancelScheduledValues() {}
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
}

class FakeNode {
  constructor(ctx) { this.context = ctx; this.gain = new FakeParam(); }
  connect(node) { this.context._connections.push([this, node]); return node; }
  disconnect() { this.context._disconnected++; }
}

class FakeBufferSource {
  constructor(ctx) { this.context = ctx; this.playbackRate = { setTargetAtTime() {} }; }
  connect(node) { this.context._connections.push([this, node]); }
  start() {}
  stop() {}
}

export class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this._connections = [];
    this._disconnected = 0;
  }
  createGain() { return new FakeNode(this); }
  createAnalyser() {
    return {
      fftSize: 0,
      smoothingTimeConstant: 0,
      frequencyBinCount: 256,
      getByteFrequencyData() {},
      getByteTimeDomainData() {},
    };
  }
  createMediaStreamSource() { return new FakeNode(this); }
}

export class AudioListener {
  constructor() {
    this.context = new FakeContext();
    contexts.push(this.context);
    this.gain = new FakeNode(this.context);
  }
  getInput() { return this.gain; }
}

export class Audio {
  constructor(listener) {
    this.listener = listener;
    this.context = listener.context;
    this.gain = new FakeNode(this.context);
    this.isPlaying = false;
  }
  getOutput() { return this.gain; }
  setBuffer() { this.hasBuffer = true; }
  setLoop() {}
  setVolume() {}
  play() {
    this.isPlaying = true;
    this.source = new FakeBufferSource(this.context);
    this.source.connect(this.gain);
  }
  pause() { this.isPlaying = false; }
  stop() { this.isPlaying = false; }
}

export class AudioLoader {
  load(_file, onLoad) { onLoad({ duration: 1 }); }
}
