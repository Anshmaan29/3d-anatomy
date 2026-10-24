import type { Camera, Mesh, Vector3 } from 'three';
import type { OrbitControls } from 'three-stdlib';

/** Programmatic camera motion yields immediately to mouse/touch controls. */
export class CameraMotion {
  destination: { position: Vector3; target: Vector3 } | null = null;
  interacting = false;
  private damping: boolean | null = null;
  constructor(private camera: Camera, private getControls: () => OrbitControls | null) {}

  beginInteraction() { this.cancel(); this.interacting = true; }
  endInteraction() { this.interacting = false; }

  cancel() {
    this.destination = null;
    const controls = this.getControls();
    if (controls && this.damping !== null) controls.enableDamping = this.damping;
    this.damping = null;
  }

  start(position: Vector3, target: Vector3, immediate = false) {
    if (this.interacting) return;
    this.cancel();
    const controls = this.getControls();
    if (!controls) return;
    this.damping = controls.enableDamping;
    // Drain residual orbit/pan momentum without visibly changing the starting pose.
    const previousPosition = this.camera.position.clone(), previousTarget = controls.target.clone();
    controls.enableDamping = false;
    controls.update();
    this.camera.position.copy(previousPosition); controls.target.copy(previousTarget); controls.update();
    this.destination = { position: position.clone(), target: target.clone() };
    if (immediate) this.finish();
  }

  private finish() {
    const controls = this.getControls();
    if (this.destination && controls) {
      this.camera.position.copy(this.destination.position);
      controls.target.copy(this.destination.target);
      controls.update();
    }
    this.cancel();
  }

  step(delta: number) {
    const controls = this.getControls(), destination = this.destination;
    if (!destination || !controls) return false;
    // A demand-rendered canvas may have been idle for minutes before this frame.
    const alpha = 1 - Math.exp(-Math.min(Math.max(delta, 0), .05) * 9);
    this.camera.position.lerp(destination.position, alpha);
    controls.target.lerp(destination.target, alpha);
    controls.update();
    if (this.camera.position.distanceTo(destination.position) < .0005 && controls.target.distanceTo(destination.target) < .0005) this.finish();
    return true;
  }
}

/** OrbitControls handles gestures natively; skip expensive anatomy picking meanwhile. */
export function interactionRaycast(active: () => boolean, raycast: Mesh['raycast']): Mesh['raycast'] {
  return function (this: Mesh, raycaster, hits) { if (!active()) raycast.call(this, raycaster, hits); };
}
