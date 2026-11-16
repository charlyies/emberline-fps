// Viewmodel gun — the first-person weapon the player sees. One module, one
// job: build the box-assembled gun, and animate it (walk bob, fire kick,
// reload dip) from the state main.js reports each frame.
import * as THREE from 'three';

export function createViewmodel(camera) {
  const gun = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff7a1a, emissiveIntensity: 0.8 });
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.5), dark);
  barrel.position.set(0, -0.02, -0.3); gun.add(barrel);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.28), dark);
  body.position.set(0, -0.02, -0.05); gun.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.02, 0.2), accent);
  stripe.position.set(0, 0.03, -0.1); gun.add(stripe);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.1), dark);
  grip.position.set(0, -0.12, 0.06); grip.rotation.x = 0.35; gun.add(grip);
  gun.position.set(0.28, -0.24, -0.45);
  camera.add(gun);

  // Muzzle flash: a brief warm light at the barrel tip when a shot fires.
  const flash = new THREE.PointLight(0xffc27a, 0, 6, 1.8);
  flash.position.set(0.28, -0.2, -0.95);
  camera.add(flash);
  let flashLife = 0;
  let bobPhase = 0;
  let kick = 0; // 0..1, decays; drives the gun back along z
  let dip = 0; // 0..1 while reloading, dips the gun down and tilts it

  return {
    group: gun,
    // Called when the player fires: shoves the gun back and lights the flash.
    fire() { kick = 1; flashLife = 0.06; flash.intensity = 26; },
    // Called every rendered frame with the player's speed and reload state.
    update(dt, speed, reloading) {
      if (flashLife > 0) { flashLife -= dt; if (flashLife <= 0) flash.intensity = 0; }
      kick = Math.max(0, kick - dt * 7);
      const targetDip = reloading ? 1 : 0;
      dip += (targetDip - dip) * Math.min(1, dt * 8);
      bobPhase += dt * speed * 1.6;
      const bobA = Math.min(1, speed / 5) * 0.012;
      gun.position.set(
        0.28 + Math.sin(bobPhase) * bobA,
        -0.24 - dip * 0.09 + Math.abs(Math.cos(bobPhase)) * bobA * 0.7,
        -0.45 - kick * 0.07,
      );
      gun.rotation.x = kick * 0.09 + dip * 0.5;
      gun.rotation.z = dip * 0.25;
    },
  };
}
