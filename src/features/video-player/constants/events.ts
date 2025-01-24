export enum VideoPlayerEvents {
  SetupWorker = "setup.worker",
  SetupWorkerSuccess = "setup.worker.success",
  SetupWorkerError = "setup.worker.error",

  VideoStatus = "video.status",
  VideoConfig = "video.config",
  VideoMetadata = "video.metadata",
  VideoPlayback = "video.playback",
  VideoProgress = "video.loading",
  VideoFrame = "video.frame",

  PlayVideo = "play.video",
  PlayVideoSuccess = "play.video.success",
  PlayVideoError = "play.video.error",

  PlayVideoReverse = "play.video.reverse",
  PlayVideoReverseSuccess = "play.video.reverse.success",
  PlayVideoReverseError = "play.video.reverse.error",

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
