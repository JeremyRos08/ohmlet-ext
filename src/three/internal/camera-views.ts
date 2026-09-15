import * as THREE from 'three'
export type CameraView = 'iso' | 'top' | 'front' | 'side'
const directions = { iso: [1, 1.25, 1.4], top: [0, 1, 0.0001], front: [0, 0.12, 1], side: [1, 0.12, 0] } as const
export function fitCameraView(box: THREE.Box3, view: CameraView, fov: number, aspect: number) {
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const target = sphere.center.clone()
  const halfFov = Math.min(THREE.MathUtils.degToRad(fov) / 2,
    Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.max(aspect, 0.01)))
  const distance = (Math.max(sphere.radius, 2) + 1) / Math.sin(halfFov) * 1.15
  const position = new THREE.Vector3(...directions[view]).normalize().multiplyScalar(distance).add(target)
  return { position, target, distance }
}
