import * as THREE from 'three/webgpu'

export function addFireflies(scene) {
  // A soft halo around a bright circular center, shared by every firefly.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255, 255, 220, 1)');
  glow.addColorStop(0.16, 'rgba(255, 247, 139, 1)');
  glow.addColorStop(0.3, 'rgba(255, 220, 70, 0.7)');
  glow.addColorStop(0.6, 'rgba(255, 205, 50, 0.2)');
  glow.addColorStop(1, 'rgba(255, 205, 50, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const fireflies = Array.from({ length: 24 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * 4.2;
    const anchor = new THREE.Vector3(
      Math.cos(angle) * radius,
      0.45 + Math.random() * 1.15,
      Math.sin(angle) * radius
    );
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false
    }));
    const size = 0.2 + Math.random() * 0.1;
    sprite.scale.setScalar(size);
    sprite.position.copy(anchor);
    scene.add(sprite);
    return {
      sprite,
      anchor,
      size,
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.4,
      drift: 0.15 + Math.random() * 0.25
    };
  });

  return function updateFireflies(elapsed) {
    for (const { sprite, anchor, size, phase, speed, drift } of fireflies) {
      const motion = elapsed * speed + phase;
      sprite.position.set(
        anchor.x + Math.sin(motion) * drift,
        anchor.y + Math.sin(motion * 1.3 + phase) * 0.16,
        anchor.z + Math.cos(motion * 0.8 + phase) * drift
      );
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 1.6 + phase);
      sprite.material.opacity = 0.55 + pulse * 0.45;
      sprite.scale.setScalar(size * (0.9 + pulse * 0.1));
    }
  };
}
