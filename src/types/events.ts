export interface RuntimeMessage {
  type: string;
  payload?: any;
}

export enum RuntimeEvents {
  SetupWorker = "setup.worker",
  SetupWorkerSuccess = "setup.worker.success",

  StartCapture = "start.capture",
  SaveCapture = "save.capture",
}
