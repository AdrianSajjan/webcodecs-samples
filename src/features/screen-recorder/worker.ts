import type { RuntimeMessage } from "@/shared/types/events";
import type { RecorderCaptureProps } from "./codec/base";

async function setupWorker() {
  const { MP4Recorder } = await import("./codec/mp4");
  const { WebMRecorder } = await import("./codec/webm");
  const { ScreenRecorderEvents } = await import("./constants/events");

  const mp4 = MP4Recorder.createInstance({ clone: true });
  const webm = WebMRecorder.createInstance({ clone: false });

  self.addEventListener("message", (event: MessageEvent<RuntimeMessage>) => {
    switch (event.data.type) {
      case ScreenRecorderEvents.SetupWorker:
        self.postMessage({ type: ScreenRecorderEvents.SetupWorkerSuccess });
        break;

      case ScreenRecorderEvents.RecordStream:
        Promise.all([mp4.handleRecordStream(), webm.handleRecordStream()]);
        break;

      case ScreenRecorderEvents.CaptureStream:
        const data = event.data.payload as RecorderCaptureProps;
        const videos = data.videoReadableStream.tee();
        const audios = data.audioReadableStream?.tee();

        Promise.all([
          mp4.handleCaptureStream({ ...data, videoReadableStream: videos[0], audioReadableStream: audios?.[0] }),
          webm.handleCaptureStream({ ...data, videoReadableStream: videos[1], audioReadableStream: audios?.[1] }),
        ]).then(
          () => {
            self.postMessage({ type: ScreenRecorderEvents.CaptureStreamSuccess });
          },
          (error) => {
            self.postMessage({ type: ScreenRecorderEvents.CaptureStreamError, payload: error });
          }
        );
        break;

      case ScreenRecorderEvents.SaveStream:
        Promise.all([mp4.handleSaveStream(), webm.handleSaveStream()]).then(
          ([mp4, webm]) => {
            self.postMessage({ type: ScreenRecorderEvents.SaveStreamSuccess, payload: { mp4, webm } }, [mp4, webm]);
          },
          (error) => {
            self.postMessage({ type: ScreenRecorderEvents.SaveStreamError, payload: error });
          }
        );
        break;
    }
  });
}

setupWorker();
