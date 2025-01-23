export interface RuntimeMessage {
  type: string;
  payload?: any;
}

export enum RuntimeEvents {
  SetupWorker = "setup.worker",
  SetupWorkerSuccess = "setup.worker.success",
  SetupWorkerError = "setup.worker.error",

  CaptureStream = "capture.stream",
  CaptureStreamSuccess = "capture.stream.success",
  CaptureStreamError = "capture.stream.error",

  SaveStream = "save.stream",
  SaveStreamSuccess = "save.stream.success",
  SaveStreamError = "save.stream.error",

  RecordStream = "record.stream",
  RecordStreamSuccess = "record.stream.success",
  RecordStreamError = "record.stream.error",

  MP4WorkerStatus = "mp4.worker.status",
  MP4WorkerConfig = "mp4.worker.config",
  MP4WorkerMetadata = "mp4.worker.metadata",
  MP4PlaybackStatus = "mp4.playback.status",
  MP4LoadingProgress = "mp4.loading.progress",
  MP4FrameInfo = "mp4.frame.info",

  PlayVideo = "play.video",
  PlayVideoSuccess = "play.video.success",
  PlayVideoError = "play.video.error",

  PauseVideo = "pause.video",
  PauseVideoSuccess = "pause.video.success",
  PauseVideoError = "pause.video.error",

  PlaybackSpeed = "playback.speed",
  PlaybackSpeedSuccess = "playback.speed.success",
  PlaybackSpeedError = "playback.speed.error",

  SeekVideo = "seek.video",
  SeekVideoSuccess = "seek.video.success",
  SeekVideoError = "seek.video.error",
}
