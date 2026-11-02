/**
 * What `import … from "three"` resolves to in the browser bundle (next.config.ts, turbopack.resolveAlias): three
 * itself, with one class swapped.
 *
 * three r183 deprecated THREE.Clock in favour of THREE.Timer and its constructor now logs a warning. react-three-fiber
 * still constructs a Clock for every Canvas and has no way to hand it another one, so every visit to the hall opened
 * with that warning. This Clock keeps the API fiber and the hall use (getDelta, getElapsedTime, elapsedTime and
 * oldTime read and written by fiber's advance(), start, stop, running, autoStart) and keeps time with a Timer.
 *
 * Scripts run by node directly (export-models, compress-models) import the real three; only the bundle is aliased.
 */
export * from "three/src/Three.js";
import { Timer } from "three/src/Three.js";

export class Clock {
  autoStart: boolean;
  startTime = 0;
  oldTime = 0;
  elapsedTime = 0;
  running = false;
  private timer = new Timer();
  constructor(autoStart = true) { this.autoStart = autoStart; }
  start() { this.timer.reset(); this.startTime = performance.now(); this.oldTime = 0; this.elapsedTime = 0; this.running = true; }
  stop() { this.getElapsedTime(); this.running = false; this.autoStart = false; }
  getElapsedTime() { this.getDelta(); return this.elapsedTime; }
  getDelta() {
    if (this.autoStart && !this.running) { this.start(); return 0; }
    if (!this.running) return 0;
    this.timer.update();
    const d = this.timer.getDelta();
    this.oldTime = this.elapsedTime;
    this.elapsedTime += d;
    return d;
  }
}
