import type { RuntimeMessage } from "@/types/events";

async function setupWorker() {
  const { RuntimeEvents } = await import("@/types/events");
  const { Recorder } = await import("@/packages/recorder");

  const recorder = Recorder.createInstance();

  self.addEventListener("message", (event: MessageEvent<RuntimeMessage>) => {
    switch (event.data.type) {
      case RuntimeEvents.SetupWorker:
        self.postMessage({ type: RuntimeEvents.SetupWorkerSuccess });
        break;

      case RuntimeEvents.RecordStream:
        recorder.handleRecordStream(event.data.payload).then(
          () => {
            self.postMessage({ type: RuntimeEvents.RecordStreamSuccess });
          },
          (error) => {
            self.postMessage({ type: RuntimeEvents.RecordStreamError, payload: error });
          }
        );
        break;

      case RuntimeEvents.SaveStream:
        recorder.handleSaveStream().then(
          (buffer) => {
            self.postMessage({ type: RuntimeEvents.SaveStreamSuccess, payload: buffer }, [buffer]);
          },
          (error) => {
            self.postMessage({ type: RuntimeEvents.SaveStreamError, payload: error });
          }
        );
        break;
    }
  });
}

setupWorker();
