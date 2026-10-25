import { describe, expect, it } from 'vitest'
import { pitchFromKeypoints, toFaceSample } from './face-geometry'
import type { FaceKeypoints } from './face-geometry'

const face = (noseY: number): FaceKeypoints => ({
  rightEye: { x: 100, y: 100 },
  leftEye: { x: 160, y: 100 },
  noseTip: { x: 130, y: noseY },
  rightEar: { x: 60, y: 110 },
  leftEar: { x: 200, y: 110 },
})

describe('pitchFromKeypoints', () => {
  it('is zero when the nose tip is level with the ears', () => {
    expect(pitchFromKeypoints(face(110))).toBeCloseTo(0)
  })

  it('grows as the nose drops below the ear line', () => {
    const levels = [110, 130, 150].map((y) => pitchFromKeypoints(face(y)) ?? Number.NaN)
    expect(levels[1]).toBeGreaterThan(levels[0]!)
    expect(levels[2]).toBeGreaterThan(levels[1]!)
  })

  it('converts the vertical drop through the nose depth', () => {
    expect(pitchFromKeypoints(face(110 + 48))).toBeCloseTo(30)
  })

  it('rejects degenerate keypoints', () => {
    const k = face(120)
    expect(toFaceSample({ ...k, leftEye: k.rightEye }, 0.3)).toBeNull()
  })
})
