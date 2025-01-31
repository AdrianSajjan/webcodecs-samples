import { RuntimeMessage } from "@/shared/types/events";
import { waitUnitWorkerEvent } from "@/shared/libs/utils";

import { MP4AudioMetadata, MP4VideoMetadata } from "./demuxer";
import { VideoPlayerEvents } from "./constants/events";

import { VideoPlayerEventMap } from "./interfaces/events";
import { VideoPlayerEvent, VideoPlayerEventListener } from "./interfaces/events";
import { VideoPlayerStatus, VideoPlayerPlaybackState, VideoPlayerInitializeOptions } from "./interfaces/player";

export class MP4Player extends EventTarget {
  uri: string;
  status: VideoPlayerStatus;
  playback: VideoPlayerPlaybackState;

  currentTime: number;
  currentFrame: number;
  originalWidth: number;
  originalHeight: number;
  playbackSpeed: number;

  videoMetadata: MP4VideoMetadata | null;
  videoConfig: VideoDecoderConfig | null;

  audioMetadata: MP4AudioMetadata | null;
  audioConfig: AudioDecoderConfig | null;
  audioBuffer: AudioBuffer | null;
  audioChannelData: Float32Array[] | null;

  worker: Worker;
  canvas: HTMLCanvasElement;
  context!: AudioContext;

  resize?: ResizeObserver;
  container?: HTMLElement;
  source?: AudioBufferSourceNode;

  ready?: PromiseWithResolvers<void>;
  options?: VideoPlayerInitializeOptions;

  constructor(uri: string, container?: HTMLElement, options?: VideoPlayerInitializeOptions) {
    super();

    this.uri = uri;
    this.status = "idle";
    this.playback = "paused";
    this.options = options;

    this.currentTime = 0;
    this.currentFrame = 0;
    this.playbackSpeed = 1;

    this.videoMetadata = null;
    this.videoConfig = null;

    this.audioMetadata = null;
    this.audioConfig = null;
    this.audioChannelData = null;
    this.audioBuffer = null;

    this.originalWidth = 0;
    this.originalHeight = 0;
    this.canvas = document.createElement("canvas");

    if (container) {
      this.container = container;
      this.container.appendChild(this.canvas);
    }

    this.resize = this.setupResizeObserver();
    this.worker = this.handleCreateWorker();
    this.handleSetupWorker();
  }

  static createInstance(uri: string, container?: HTMLElement) {
    return new MP4Player(uri, container);
  }

  private handleCreateWorker() {
    const url = new URL("./worker.ts", import.meta.url);
    const worker = new Worker(url);
    return worker;
  }

  private handleSetupWorker() {
    const canvas = this.canvas.transferControlToOffscreen();
    this.worker.addEventListener("message", this.handleWorkerMessage.bind(this));
    this.worker.postMessage({ type: VideoPlayerEvents.SetupWorker, payload: { uri: this.uri, canvas } }, [canvas]);
  }

  private handleCanvasResize(originalWidth: number, originalHeight: number) {
    this.originalWidth = originalWidth;
    this.originalHeight = originalHeight;

    if (this.container) {
      const videoAspectRatio = originalWidth / originalHeight;

      if (this.options?.fluid) {
        const containerRect = this.container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        const containerAspectRatio = containerWidth / containerHeight;

        let width: number;
        let height: number;

        if (containerAspectRatio > videoAspectRatio) {
          height = containerHeight;
          width = containerHeight * videoAspectRatio;
        } else {
          width = containerWidth;
          height = containerWidth / videoAspectRatio;
        }

        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 2) * 2;

        this.canvas.style.width = width + "px";
        this.canvas.style.height = height + "px";
      } else {
        this.canvas.style.width = "100%";
        this.canvas.style.height = "auto";
        this.canvas.style.aspectRatio = String(videoAspectRatio);
      }
    }
  }

  private setupResizeObserver() {
    if (!this.container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this.container && this.originalWidth && this.originalHeight) {
          this.handleCanvasResize(this.originalWidth, this.originalHeight);
          break;
        }
      }
    });
    resizeObserver.observe(this.container);
    return resizeObserver;
  }

  private async createAudioBuffer() {
    if (!this.audioMetadata || !this.audioChannelData || this.audioBuffer) return;

    this.context = new AudioContext({ latencyHint: "interactive" });
    this.audioBuffer = this.context.createBuffer(this.audioMetadata.numberOfChannels, this.audioChannelData[0].length, this.audioMetadata.sampleRate);

    for (let channel = 0; channel < this.audioMetadata.numberOfChannels; channel++) {
      this.audioBuffer.copyToChannel(this.audioChannelData[channel], channel);
    }
  }

  async connectAudioSource() {
    if (this.source) this.source.stop();
    this.source = this.context.createBufferSource();
    this.source.buffer = this.audioBuffer;
    this.source.connect(this.context.destination);
  }

  private async startAudioSource() {
    if (this.source) {
      this.source.playbackRate.value = this.playbackSpeed;
      this.source.start(0, this.currentTime);
    }
  }

  private handleWorkerMessage(event: MessageEvent<RuntimeMessage>) {
    switch (event.data.type) {
      case VideoPlayerEvents.VideoStatus:
        this.status = event.data.payload.status as VideoPlayerStatus;
        if (this.status === "ready") this.ready?.resolve();
        this.emit(VideoPlayerEvents.VideoStatus, this.status);
        break;

      case VideoPlayerEvents.VideoConfig:
        this.videoConfig = event.data.payload.config as VideoDecoderConfig;
        this.handleCanvasResize(this.videoConfig.codedWidth || 0, this.videoConfig.codedHeight || 0);
        this.emit(VideoPlayerEvents.VideoConfig, this.videoConfig);
        break;

      case VideoPlayerEvents.VideoMetadata:
        this.videoMetadata = event.data.payload.metadata as MP4VideoMetadata;
        this.emit(VideoPlayerEvents.VideoMetadata, this.videoMetadata);
        break;

      case VideoPlayerEvents.AudioMetadata:
        this.audioMetadata = event.data.payload.metadata as MP4AudioMetadata;
        this.emit(VideoPlayerEvents.AudioMetadata, this.audioMetadata);
        break;

      case VideoPlayerEvents.AudioBuffer:
        this.audioBuffer = null;
        this.audioChannelData = event.data.payload.buffer as Float32Array[];
        this.emit(VideoPlayerEvents.AudioBuffer);
        break;

      case VideoPlayerEvents.VideoEnded:
        this.playback = "ended";
        this.emit(VideoPlayerEvents.VideoEnded);
        break;

      case VideoPlayerEvents.FrameUpdated:
        this.currentFrame = event.data.payload.frame;
        this.emit(VideoPlayerEvents.FrameUpdated, this.currentFrame);
        break;

      case VideoPlayerEvents.TimeUpdated:
        this.currentTime = event.data.payload.time;
        this.emit(VideoPlayerEvents.TimeUpdated, this.currentTime);
        break;
    }
  }

  protected emit<T extends keyof VideoPlayerEventMap>(type: T, detail?: VideoPlayerEventMap[T]): void {
    const event = new CustomEvent(type, { detail, bubbles: false, cancelable: false });
    this.dispatchEvent(event);
  }

  // @ts-expect-error
  addEventListener<T extends keyof VideoPlayerEventMap>(type: T, listener: VideoPlayerEventListener<T>, options?: AddEventListenerOptions): void {
    super.addEventListener(type, listener as EventListener, options);
  }

  // @ts-expect-error
  removeEventListener<T extends keyof VideoPlayerEventMap>(type: T, listener: VideoPlayerEventListener<T>, options?: EventListenerOptions): void {
    super.removeEventListener(type, listener as EventListener, options);
  }

  dispatchEvent<T extends keyof VideoPlayerEventMap>(event: VideoPlayerEvent<T>): boolean {
    return super.dispatchEvent(event);
  }

  async initialize() {
    if (this.status === "ready") return;
    this.ready = Promise.withResolvers();
    await this.ready.promise;
  }

  async play() {
    await this.initialize();

    this.createAudioBuffer();
    this.connectAudioSource();
    this.startAudioSource();

    this.worker.postMessage({ type: VideoPlayerEvents.PlayVideo });
    await waitUnitWorkerEvent(this.worker, { success: VideoPlayerEvents.PlayVideoSuccess, error: VideoPlayerEvents.PlayVideoError });
    this.playback = "playing";
  }

  async reverse() {
    await this.initialize();
    this.worker.postMessage({ type: VideoPlayerEvents.PlayVideoReverse });
    await waitUnitWorkerEvent(this.worker, { success: VideoPlayerEvents.PlayVideoReverseSuccess, error: VideoPlayerEvents.PlayVideoReverseError });
    this.playback = "playing";
  }

  async seek(type: "frame" | "time", value: number) {
    await this.initialize();
    this.worker.postMessage({ type: VideoPlayerEvents.SeekVideo, payload: { type, value } });
    await waitUnitWorkerEvent(this.worker, { success: VideoPlayerEvents.SeekVideoSuccess, error: VideoPlayerEvents.SeekVideoError });
  }

  async next() {
    await this.initialize();
    return new Promise<ImageBitmap>((resolve, reject) => {
      this.worker.postMessage({ type: VideoPlayerEvents.NextFrame });
      waitUnitWorkerEvent(this.worker, {
        success: VideoPlayerEvents.NextFrameSuccess,
        error: VideoPlayerEvents.NextFrameError,
        onSuccess: (payload) => {
          this.currentFrame = payload.frame;
          resolve(payload.bitmap);
        },
        onError: (payload) => {
          reject(payload);
        },
      });
    });
  }

  async pause() {
    await this.initialize();
    this.worker.postMessage({ type: VideoPlayerEvents.PauseVideo });
    await waitUnitWorkerEvent(this.worker, { success: VideoPlayerEvents.PauseVideoSuccess, error: VideoPlayerEvents.PauseVideoError });

    if (this.source) this.source.stop();
    this.playback = "paused";
  }

  async speed(speed: number) {
    if (this.source) this.source.playbackRate.value = speed;
    this.playbackSpeed = speed;

    this.worker.postMessage({ type: VideoPlayerEvents.PlaybackSpeed, payload: { speed } });
    await waitUnitWorkerEvent(this.worker, { success: VideoPlayerEvents.PlaybackSpeedSuccess, error: VideoPlayerEvents.PlaybackSpeedError });
  }

  async destroy() {
    this.canvas.remove();
    this.worker.terminate();
    this.resize?.disconnect();
    this.source?.stop();
  }
}
