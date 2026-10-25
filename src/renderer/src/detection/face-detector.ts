import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import type { Detection } from '@mediapipe/tasks-vision'
import type { FaceSample } from '../../../shared/posture/engine'
import { toFaceSample } from '../../../shared/posture/face-geometry'
import type { Point } from '../../../shared/posture/face-geometry'

type Keypoint = Detection['keypoints'][number]

const assetUrl = (path: string): string => new URL(path, document.baseURI).href

export const createFaceDetector = async (): Promise<FaceDetector> => {
  const fileset = await FilesetResolver.forVisionTasks(assetUrl('mediapipe'))
  return FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: assetUrl('models/blaze_face_short_range.tflite'), delegate: 'CPU' },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.5,
  })
}

let frame: CanvasRenderingContext2D | null = null

// The CPU delegate returns no detections when given a <video> element directly, so copy the frame to a canvas first
const captureFrame = (video: HTMLVideoElement, width: number, height: number): HTMLCanvasElement => {
  if (!frame || frame.canvas.width !== width || frame.canvas.height !== height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    frame = canvas.getContext('2d', { willReadFrequently: true })!
  }
  frame.drawImage(video, 0, 0, width, height)
  return frame.canvas
}

const toPixels = (k: Keypoint | undefined, width: number, height: number): Point | null =>
  k ? { x: k.x * width, y: k.y * height } : null

const largestFace = (detections: Detection[]): Detection | undefined =>
  detections.reduce<Detection | undefined>(
    (best, d) => ((d.boundingBox?.height ?? 0) > (best?.boundingBox?.height ?? 0) ? d : best),
    undefined,
  )

export const detectFace = (detector: FaceDetector, video: HTMLVideoElement): FaceSample | null => {
  const { videoWidth: width, videoHeight: height } = video
  if (width === 0 || height === 0) return null

  const face = largestFace(detector.detectForVideo(captureFrame(video, width, height), performance.now()).detections)
  if (!face?.boundingBox) return null

  const [rightEye, leftEye, noseTip, , rightEar, leftEar] = face.keypoints.map((k) => toPixels(k, width, height))
  if (!rightEye || !leftEye || !noseTip || !rightEar || !leftEar) return null
  return toFaceSample({ rightEye, leftEye, noseTip, rightEar, leftEar }, face.boundingBox.height / height)
}
