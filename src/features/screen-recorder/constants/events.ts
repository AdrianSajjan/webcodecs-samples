export enum ScreenRecorderEvents {
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
}
