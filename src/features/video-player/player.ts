import { RuntimeMessage } from "@/shared/types/events";
import { waitUnitWorkerEvent } from "@/shared/libs/utils";

import { MP4FileMetadata } from "./demuxer";
import { VideoPlayerEvents } from "./constants/events";

import { VideoPlayerEventMap } from "./interfaces/events";
import { VideoPlayerEvent, VideoPlayerEventListener } from "./interfaces/events";
import { VideoPlayerStatus, VideoPlayerPlaybackState, VideoPlayerInitializeOptions } from "./interfaces/player";

export class MP4Player extends EventTarget {
  status: VideoPlayerStatus;
  uri: string;
  playback: VideoPlayerPlaybackState;

  currentTime: number;
  currentFrame: number;
  originalWidth: number;
  originalHeight: number;

  metadata: MP4FileMetadata | null;
  config: VideoDecoderConfig | null;

  worker: Worker;
  canvas: HTMLCanvasElement;

  resize?: ResizeObserver;
  container?: HTMLElement;
  ready?: PromiseWithResolvers<void>;
  options?: VideoPlayerInitializeOptions;

  constructor(uri: string, container?: HTMLElement, options?: VideoPlayerInitializeOptions) {
    super();

    this.uri = uri;
    this.status = "idle";
    this.playback = "paused";

    this.currentTime = 0;
    this.currentFrame = 0;

    this.metadata = null;
    this.config = null;
    this.options = options;

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

  private handleWorkerMessage(event: MessageEvent<RuntimeMessage>) {
    switch (event.data.type) {
      case VideoPlayerEvents.VideoStatus:
        this.status = event.data.payload.status as VideoPlayerStatus;
        if (this.status === "ready") this.ready?.resolve();
        this.emit(VideoPlayerEvents.VideoStatus, this.status);
        break;

      case VideoPlayerEvents.VideoConfig:
        this.config = event.data.payload.config as VideoDecoderConfig;
        this.handleCanvasResize(this.config.codedWidth || 0, this.config.codedHeight || 0);
        this.emit(VideoPlayerEvents.VideoConfig, this.config);
        break;

      case VideoPlayerEvents.VideoMetadata:
        this.metadata = event.data.payload.metadata as MP4FileMetadata;
        this.emit(VideoPlayerEvents.VideoMetadata, this.metadata);
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
  addEventListener<T extends keyof VideoPlayerEventMap>(
    type: T,
    listener: VideoPlayerEventListener<T>,
    options?: AddEventListenerOptions
  ): void {
    super.addEventListener(type, listener as EventListener, options);
  }

  // @ts-expect-error
  removeEventListener<T extends keyof VideoPlayerEventMap>(
    type: T,
    listener: VideoPlayerEventListener<T>,
    options?: EventListenerOptions
  ): void {
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
    this.worker.postMessage({ type: VideoPlayerEvents.PlayVideo });
    await waitUnitWorkerEvent(this.worker, {
      success: VideoPlayerEvents.PlayVideoSuccess,
      error: VideoPlayerEvents.PlayVideoError,
    });
    this.playback = "playing";
  }

  async reverse() {
    this.worker.postMessage({ type: VideoPlayerEvents.PlayVideoReverse });
    await waitUnitWorkerEvent(this.worker, {
      success: VideoPlayerEvents.PlayVideoReverseSuccess,
      error: VideoPlayerEvents.PlayVideoReverseError,
    });
    this.playback = "playing";
  }

  async seek(type: "frame" | "time", value: number) {
    this.worker.postMessage({ type: VideoPlayerEvents.SeekVideo, payload: { type, value } });
    await waitUnitWorkerEvent(this.worker, {
      success: VideoPlayerEvents.SeekVideoSuccess,
      error: VideoPlayerEvents.SeekVideoError,
    });
  }

  async next() {
    this.worker.postMessage({ type: VideoPlayerEvents.NextFrame });
    await waitUnitWorkerEvent(this.worker, {
      success: VideoPlayerEvents.NextFrameSuccess,
      error: VideoPlayerEvents.NextFrameError,
    });
  }

  async pause() {
    this.worker.postMessage({ type: VideoPlayerEvents.PauseVideo });
    await waitUnitWorkerEvent(this.worker, {
      success: VideoPlayerEvents.PauseVideoSuccess,
      error: VideoPlayerEvents.PauseVideoError,
    });
    this.playback = "paused";
  }

  async speed(speed: number) {
    this.worker.postMessage({ type: VideoPlayerEvents.PlaybackSpeed, payload: { speed } });
    await waitUnitWorkerEvent(this.worker, {
      success: VideoPlayerEvents.PlaybackSpeedSuccess,
      error: VideoPlayerEvents.PlaybackSpeedError,
    });
  }

  async destroy() {
    this.canvas.remove();
    this.worker.terminate();
    this.resize?.disconnect();
  }
}
