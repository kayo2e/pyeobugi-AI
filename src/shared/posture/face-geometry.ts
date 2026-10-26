import type { FaceSample } from './engine'

export type Point = { x: number; y: number }

export type FaceKeypoints = {
  rightEye: Point
  leftEye: Point
  noseTip: Point
  rightEar: Point
  leftEar: Point
}

// Tragion-to-nose-tip depth is roughly 1.6x the interpupillary distance on an average adult face
const NOSE_DEPTH_PER_EYE_DISTANCE = 1.6

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export const MIN_EYE_DISTANCE_PX = 8

export const pitchFromKeypoints = (k: FaceKeypoints): number | null => {
  if (Object.values(k).some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const eyeDistance = Math.hypot(k.leftEye.x - k.rightEye.x, k.leftEye.y - k.rightEye.y)
  if (eyeDistance < MIN_EYE_DISTANCE_PX) return null
  // Looking down rotates the nose tip below the ear line; the vertical drop is depth * sin(pitch)
  const drop = (k.noseTip.y - midpoint(k.rightEar, k.leftEar).y) / (eyeDistance * NOSE_DEPTH_PER_EYE_DISTANCE)
  if (!Number.isFinite(drop) || Math.abs(drop) >= 1) return null
  return (Math.asin(drop) * 180) / Math.PI
}

export const toFaceSample = (k: FaceKeypoints, faceHeightRatio: number): FaceSample | null => {
  if (!Number.isFinite(faceHeightRatio) || faceHeightRatio <= 0 || faceHeightRatio > 1) return null
  const pitch = pitchFromKeypoints(k)
  return pitch === null ? null : { pitch, size: faceHeightRatio }
}
