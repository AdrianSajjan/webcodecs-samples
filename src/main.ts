import { assert } from "@/libs/utils";
import { RuntimeEvents, RuntimeMessage } from "@/types/events";

const mSampleRate = 48000;

class Core {
  recording: boolean;
  capturing: boolean;
  video: HTMLVideoElement;

  private userStream?: MediaStream;
  private desktopStream?: MediaStream;
  private audioContext?: AudioContext;
  private audioDestination?: MediaStreamAudioDestinationNode;

  private saveStreamResolver?: PromiseWithResolvers<Blob> | null;
  private recordStreamResolver?: PromiseWithResolvers<void> | null;

  private worker: Worker;
  private runtimeMessageHandler = this.handleRuntimeMessage.bind(this);

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.recording = false;
    this.capturing = false;
    this.worker = new Worker(new URL("./worker/recorder.ts", import.meta.url));
    this.handleSetupWorker();
  }

  static createInstance(video: HTMLVideoElement) {
    return new Core(video);
  }

  private get videoTrack() {
    return this.desktopStream?.getVideoTracks()[0];
  }

  private get audioTrack() {
    return this.audioDestination?.stream.getAudioTracks()[0];
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
    if (this.capturing) return;

    this.userStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    this.desktopStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

    this.video.addEventListener("loadedmetadata", this.video.play.bind(this.video), { once: true });
    this.video.srcObject = this.desktopStream;

    this.setupAudioMixing();
    this.capturing = true;
  }

  private setupAudioMixing() {
    // Create audio context
    const desktopAudio = this.desktopStream?.getAudioTracks()[0];
    const microphoneAudio = this.userStream?.getAudioTracks()[0];

    const desktopSampleRate = desktopAudio?.getSettings().sampleRate || mSampleRate;
    const microphoneSampleRate = microphoneAudio?.getSettings().sampleRate || mSampleRate;
    const sampleRate = Math.min(mSampleRate, desktopSampleRate, microphoneSampleRate);

    this.audioContext = new AudioContext({ sampleRate });
    this.audioDestination = this.audioContext.createMediaStreamDestination();

    // Create and connect desktop audio source
    if (desktopAudio) {
      const desktopSource = this.audioContext.createMediaStreamSource(new MediaStream([desktopAudio]));
      const desktopGain = this.audioContext.createGain();
      desktopGain.gain.value = 0.7; // Adjust desktop volume (0.0 to 1.0);
      desktopSource.connect(desktopGain).connect(this.audioDestination);
    }

    // Create and connect microphone audio source
    if (microphoneAudio) {
      const microphoneSource = this.audioContext.createMediaStreamSource(new MediaStream([microphoneAudio]));
      const microphoneGain = this.audioContext.createGain();
      microphoneGain.gain.value = 1.0; // Adjust microphone volume (0.0 to 1.0)
      microphoneSource.connect(microphoneGain).connect(this.audioDestination);
    }
  }

  async handleRecordStream() {
    if (this.recording || !this.capturing) return;

    this.recording = true;
    assert(this.videoTrack);

    const videoTrackSettings = this.videoTrack.getSettings();
    const videoReadableStream = new MediaStreamTrackProcessor({ track: this.videoTrack }).readable;
    this.recordStreamResolver = Promise.withResolvers();

    if (!this.audioTrack) {
      this.worker.postMessage(
        {
          type: RuntimeEvents.RecordStream,
          payload: { videoTrackSettings, videoReadableStream },
        },
        [videoReadableStream]
      );
      return await this.recordStreamResolver.promise;
    }

    const audioTrackSettings = this.audioTrack.getSettings();
    const audioReadableStream = new MediaStreamTrackProcessor({ track: this.audioTrack }).readable;

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

    if (this.userStream) {
      this.userStream.getTracks().forEach((track) => track.stop());
      this.userStream = undefined;
    }

    if (this.audioDestination) {
      this.audioDestination.stream.getTracks().forEach((track) => track.stop());
      this.audioDestination = undefined;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }

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
