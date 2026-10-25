const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 5, max: 10 } },
}

export const openCamera = async (video: HTMLVideoElement): Promise<MediaStream> => {
  const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
  video.srcObject = stream
  await video.play()
  return stream
}

export const closeCamera = (stream: MediaStream | null): void => stream?.getTracks().forEach((track) => track.stop())
