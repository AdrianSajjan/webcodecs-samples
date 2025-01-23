import { nanoid } from "nanoid";
import { assert, wait } from "@/shared/libs/utils";
import type { RuntimeMessage } from "@/shared/types/events";
import { ScreenRecorderEvents } from "./constants/events";

const mSampleRate = 48000;

interface SaveStreamBuffer {
  webm: ArrayBuffer;
  mp4: ArrayBuffer;
}

export class ScreenRecorder {
  recording: boolean;
  capturing: boolean;
  video: HTMLVideoElement;

  private userStream?: MediaStream;
  private desktopStream?: MediaStream;
  private audioContext?: AudioContext;
  private audioDestination?: MediaStreamAudioDestinationNode;

  private captureStreamResolver?: PromiseWithResolvers<void> | null;
  private releaseStreamResolver?: PromiseWithResolvers<SaveStreamBuffer> | null;

  private worker: Worker;
  private runtimeMessageHandler = this.handleRuntimeMessage.bind(this);

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.recording = false;
    this.capturing = false;
    this.worker = new Worker(new URL("../worker/recorder.ts", import.meta.url));
    this.handleSetupWorker();
  }

  static createInstance(video: HTMLVideoElement) {
    return new ScreenRecorder(video);
  }

  private get videoTrack() {
    return this.desktopStream?.getVideoTracks()[0];
  }

  private get audioTrack() {
    return this.audioDestination?.stream.getAudioTracks()[0];
  }

  private handleSetupWorker() {
    this.worker.addEventListener("message", this.runtimeMessageHandler);
    this.worker.postMessage({ type: ScreenRecorderEvents.SetupWorker });
  }

  private handleRuntimeMessage({ data }: MessageEvent<RuntimeMessage>) {
    switch (data.type) {
      case ScreenRecorderEvents.SetupWorkerSuccess:
        console.log("Recording worker thread is ready");
        break;
      case ScreenRecorderEvents.SetupWorkerError:
        console.error(data.payload.error);
        break;

      case ScreenRecorderEvents.CaptureStreamSuccess:
        this.captureStreamResolver?.resolve();
        break;
      case ScreenRecorderEvents.CaptureStreamError:
        this.captureStreamResolver?.reject(data.payload.error);
        break;

      case ScreenRecorderEvents.SaveStreamSuccess:
        console.log("Save stream success", data.payload);
        this.releaseStreamResolver?.resolve(data.payload);
        break;
      case ScreenRecorderEvents.SaveStreamError:
        this.releaseStreamResolver?.reject(data.payload.error);
        break;
    }
  }

  async handleCaptureStream() {
    if (this.capturing) return;

    this.userStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    this.desktopStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    await wait(500);

    this.video.addEventListener("loadedmetadata", this.video.play.bind(this.video), { once: true });
    this.video.srcObject = this.desktopStream;

    this.setupAudioMixing();
    await this.initializeWorkerStream();
    this.capturing = true;
  }

  private async initializeWorkerStream() {
    assert(this.videoTrack);
    const videoTrackSettings = this.videoTrack.getSettings();
    const videoReadableStream = new MediaStreamTrackProcessor({ track: this.videoTrack }).readable;
    this.captureStreamResolver = Promise.withResolvers();

    if (!this.audioTrack) {
      this.worker.postMessage(
        {
          type: ScreenRecorderEvents.CaptureStream,
          payload: { videoTrackSettings, videoReadableStream },
        },
        [videoReadableStream]
      );
      return await this.captureStreamResolver.promise;
    }

    const audioTrackSettings = this.audioTrack.getSettings();
    const audioReadableStream = new MediaStreamTrackProcessor({ track: this.audioTrack }).readable;

    this.worker.postMessage(
      {
        type: ScreenRecorderEvents.CaptureStream,
        payload: { videoTrackSettings, videoReadableStream, audioTrackSettings, audioReadableStream },
      },
      [videoReadableStream, audioReadableStream]
    );
    await this.captureStreamResolver.promise;
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
    if (!this.capturing) return;

    this.recording = true;
    this.worker.postMessage({ type: ScreenRecorderEvents.RecordStream });
  }

  async handleSaveStream() {
    if (!this.recording) return;

    this.recording = false;
    this.releaseStreamResolver = Promise.withResolvers();
    this.worker.postMessage({ type: ScreenRecorderEvents.SaveStream });

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

    const buffer = await this.releaseStreamResolver.promise;
    Object.entries(buffer).forEach(([key, value]) => {
      const blob = new Blob([value], { type: "video/" + key });
      this.handleDownloadBlob(blob);
    });
  }

  handleDownloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nanoid() + "." + blob.type.split("/")[1];
    a.click();
  }
}
