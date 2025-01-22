import { assert } from "@/libs/utils";
import { RuntimeEvents, RuntimeMessage } from "@/types/events";

class Core {
  recording: boolean;
  video: HTMLVideoElement;

  private userStream?: MediaStream;
  private desktopStream?: MediaStream;

  private saveStreamResolver?: PromiseWithResolvers<Blob> | null;
  private recordStreamResolver?: PromiseWithResolvers<void> | null;

  private worker: Worker;
  private runtimeMessageHandler = this.handleRuntimeMessage.bind(this);

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.recording = false;
    this.worker = new Worker(new URL("./worker/recorder.ts", import.meta.url));
    this.handleSetupWorker();
  }

  static createInstance(video: HTMLVideoElement) {
    return new Core(video);
  }

  private handleSetupWorker() {
    this.worker.addEventListener("message", this.runtimeMessageHandler);
    this.worker.postMessage({ type: RuntimeEvents.SetupWorker });
  }

  private handleRuntimeMessage({ data }: MessageEvent<RuntimeMessage>) {
    switch (data.type) {
      case RuntimeEvents.SetupWorkerSuccess:
        console.log("Recording worker thread is ready");
        break;
      case RuntimeEvents.SetupWorkerError:
        console.error(data.payload.error);
        break;

      case RuntimeEvents.RecordStreamSuccess:
        this.recordStreamResolver?.resolve();
        break;
      case RuntimeEvents.RecordStreamError:
        this.recordStreamResolver?.reject(data.payload.error);
        break;

      case RuntimeEvents.SaveStreamSuccess:
        const blob = new Blob([data.payload], { type: "video/mp4" });
        this.saveStreamResolver?.resolve(blob);
        break;
      case RuntimeEvents.SaveStreamError:
        this.saveStreamResolver?.reject(data.payload.error);
        break;
    }
  }

  async handleCaptureStream() {
    this.desktopStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "browser",
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    this.video.addEventListener("loadedmetadata", this.video.play.bind(this.video), { once: true });
    this.video.srcObject = this.desktopStream;
  }

  async handleRecordStream() {
    if (this.recording || !this.desktopStream) return;

    this.recording = true;
    const videoTrack = this.desktopStream.getVideoTracks().at(0);
    const audioTrack = this.desktopStream.getAudioTracks().at(0);

    assert(videoTrack);
    const videoTrackSettings = videoTrack.getSettings();
    const videoReadableStream = new MediaStreamTrackProcessor({ track: videoTrack }).readable;

    if (!audioTrack) {
      this.recordStreamResolver = Promise.withResolvers();
      this.worker.postMessage(
        {
          type: RuntimeEvents.RecordStream,
          payload: { videoTrackSettings, videoReadableStream },
        },
        [videoReadableStream]
      );
      await this.recordStreamResolver.promise;
      return;
    }

    const audioTrackSettings = audioTrack.getSettings();
    const audioReadableStream = new MediaStreamTrackProcessor({ track: audioTrack }).readable;

    this.recordStreamResolver = Promise.withResolvers();
    this.worker.postMessage(
      {
        type: RuntimeEvents.RecordStream,
        payload: { videoTrackSettings, videoReadableStream, audioTrackSettings, audioReadableStream },
      },
      [videoReadableStream, audioReadableStream]
    );
    await this.recordStreamResolver.promise;
  }

  async handleSaveStream() {
    if (!this.recording) return;

    this.recording = false;
    this.saveStreamResolver = Promise.withResolvers();
    this.worker.postMessage({ type: RuntimeEvents.SaveStream });

    assert(this.desktopStream);
    this.desktopStream.getTracks().forEach((track) => track.stop());
    this.desktopStream = undefined;

    const blob = await this.saveStreamResolver.promise;
    this.handleDownloadBlob(blob);
  }

  handleDownloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "video.mp4";
    a.click();
  }
}

window.addEventListener("load", () => {
  if (!window.VideoEncoder || !window.VideoEncoder) {
    return alert("Your browser does not support webcodecs API yet.");
  }

  const video = document.getElementById("video") as HTMLVideoElement;
  const core = Core.createInstance(video);

  const saveButton = document.getElementById("save") as HTMLButtonElement;
  const captureButton = document.getElementById("capture") as HTMLButtonElement;
  const recordButton = document.getElementById("record") as HTMLButtonElement;

  saveButton.addEventListener("click", async () => {
    try {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
      await core.handleSaveStream();
    } catch (error) {
      alert(JSON.stringify(error));
    } finally {
      saveButton.disabled = false;
      recordButton.disabled = false;
      captureButton.disabled = false;

      saveButton.textContent = "Save";
      recordButton.textContent = "Record";
      captureButton.textContent = "Capture";
    }
  });

  captureButton.addEventListener("click", async () => {
    try {
      captureButton.disabled = true;
      captureButton.textContent = "Capturing...";
      await core.handleCaptureStream();
    } catch (error) {
      alert(JSON.stringify(error));
      captureButton.disabled = false;
      captureButton.textContent = "Capture";
    }
  });

  recordButton.addEventListener("click", async () => {
    try {
      recordButton.disabled = true;
      recordButton.textContent = "Recording...";
      await core.handleRecordStream();
    } catch (error) {
      alert(JSON.stringify(error));
      recordButton.disabled = false;
      recordButton.textContent = "Record";
    }
  });
});
