import type { RuntimeMessage } from "@/types/events";
import { RecordStreamProps } from "@/packages/base-recorder";

async function setupWorker() {
  const { RuntimeEvents } = await import("@/types/events");
  const { MP4Recorder } = await import("@/packages/mp4-recorder");
  const { WebMRecorder } = await import("@/packages/webm-recorder");

  const mp4 = MP4Recorder.createInstance(true);
  const webm = WebMRecorder.createInstance(false);

  self.addEventListener("message", (event: MessageEvent<RuntimeMessage>) => {
    switch (event.data.type) {
      case RuntimeEvents.SetupWorker:
        self.postMessage({ type: RuntimeEvents.SetupWorkerSuccess });
        break;

      case RuntimeEvents.RecordStream:
        Promise.all([mp4.handleRecordStream(), webm.handleRecordStream()]);
        break;

      case RuntimeEvents.CaptureStream:
        const data = event.data.payload as RecordStreamProps;
        const videos = data.videoReadableStream.tee();
        const audios = data.audioReadableStream?.tee();
        Promise.all([
          mp4.handleCaptureStream({ ...data, videoReadableStream: videos[0], audioReadableStream: audios?.[0] }),
          webm.handleCaptureStream({ ...data, videoReadableStream: videos[1], audioReadableStream: audios?.[1] }),
        ]).then(
          () => {
            self.postMessage({ type: RuntimeEvents.CaptureStreamSuccess });
          },
          (error) => {
            self.postMessage({ type: RuntimeEvents.CaptureStreamError, payload: error });
          }
        );
        break;

      case RuntimeEvents.SaveStream:
        Promise.all([mp4.handleSaveStream(), webm.handleSaveStream()]).then(
          ([mp4, webm]) => {
            self.postMessage({ type: RuntimeEvents.SaveStreamSuccess, payload: { mp4, webm } }, [mp4, webm]);
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
