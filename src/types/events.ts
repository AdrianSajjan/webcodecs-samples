export interface RuntimeMessage {
  type: string;
  payload?: any;
}

export enum RuntimeEvents {
  SetupWorker = "setup.worker",
  SetupWorkerSuccess = "setup.worker.success",
  SetupWorkerError = "setup.worker.error",

  SaveStream = "save.stream",
  SaveStreamSuccess = "save.stream.success",
  SaveStreamError = "save.stream.error",

  RecordStream = "record.stream",
  RecordStreamSuccess = "record.stream.success",
  RecordStreamError = "record.stream.error",
}
