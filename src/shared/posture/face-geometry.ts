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

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

export const pitchFromKeypoints = (k: FaceKeypoints): number | null => {
  const eyeDistance = Math.hypot(k.leftEye.x - k.rightEye.x, k.leftEye.y - k.rightEye.y)
  if (eyeDistance === 0) return null
  // Looking down rotates the nose tip below the ear line; the vertical drop is depth * sin(pitch)
  const drop = (k.noseTip.y - midpoint(k.rightEar, k.leftEar).y) / (eyeDistance * NOSE_DEPTH_PER_EYE_DISTANCE)
  return (Math.asin(clamp(drop, -1, 1)) * 180) / Math.PI
}

export const toFaceSample = (k: FaceKeypoints, faceHeightRatio: number): FaceSample | null => {
  const pitch = pitchFromKeypoints(k)
  return pitch === null ? null : { pitch, size: faceHeightRatio }
}
