const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 5, max: 10 } },
}

export const requestCamera = (): Promise<MediaStream> => navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)

export const attachCamera = async (video: HTMLVideoElement, stream: MediaStream): Promise<void> => {
  video.srcObject = stream
  await video.play()
}

export const closeCamera = (stream: MediaStream | null): void => stream?.getTracks().forEach((track) => track.stop())
