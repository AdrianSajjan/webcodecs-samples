import { RuntimeMessage } from "@/shared/types/events";
import { waitUnitWorkerEvent } from "@/shared/libs/utils";

import { MP4FileMetadata } from "./demuxer";
import { VideoPlayerEvents } from "./constants/events";
import { VideoPlayerStatus, VideoPlayerPlaybackState } from "./interfaces/player";

export class MP4Player extends EventTarget {
  status: VideoPlayerStatus;
  playback: VideoPlayerPlaybackState;
  uri: string;

  currentTime: number;
  currentFrame: number;
  originalWidth: number;
  originalHeight: number;

  metadata: MP4FileMetadata | null;
  config: VideoDecoderConfig | null;

  worker: Worker;
  canvas: HTMLCanvasElement;

  container?: HTMLElement;
  resize?: ResizeObserver;

  constructor(uri: string, container?: HTMLElement) {
    super();

    this.uri = uri;
    this.status = "idle";
    this.playback = "paused";

    this.currentTime = 0;
    this.currentFrame = 0;
    this.metadata = null;
    this.config = null;

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
    if (!this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    const videoAspectRatio = originalWidth / originalHeight;
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

    this.originalWidth = originalWidth;
    this.originalHeight = originalHeight;
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
      case VideoPlayerEvents.SetupWorkerSuccess:
        console.log("MP4 player worker thread is ready");
        break;

      case VideoPlayerEvents.VideoStatus:
        this.status = event.data.payload as VideoPlayerStatus;
        this.dispatchEvent(new CustomEvent(VideoPlayerEvents.VideoStatus, { detail: this.status }));
        console.log("MP4 player status:", this.status);
        break;

      case VideoPlayerEvents.VideoConfig:
        this.config = event.data.payload as VideoDecoderConfig;
        this.handleCanvasResize(this.config.codedWidth || 0, this.config.codedHeight || 0);
        this.dispatchEvent(new CustomEvent(VideoPlayerEvents.VideoConfig, { detail: this.config }));
        console.log("MP4 player config:", this.config);
        break;

      case VideoPlayerEvents.VideoMetadata:
        this.metadata = event.data.payload as MP4FileMetadata;
        this.dispatchEvent(new CustomEvent(VideoPlayerEvents.VideoMetadata, { detail: this.metadata }));
        console.log("MP4 player metadata:", this.metadata);
        break;

      case VideoPlayerEvents.VideoEnded:
        this.playback = "ended";
        this.dispatchEvent(new CustomEvent(VideoPlayerEvents.VideoEnded));
        console.log("MP4 player ended");
        break;

      case VideoPlayerEvents.FrameUpdated:
        this.currentFrame = event.data.payload.frame;
        this.dispatchEvent(new CustomEvent(VideoPlayerEvents.FrameUpdated, { detail: this.currentFrame }));
        console.log("MP4 player frame updated:", this.currentFrame);
        break;

      case VideoPlayerEvents.TimeUpdated:
        this.currentTime = event.data.payload.time;
        this.dispatchEvent(new CustomEvent(VideoPlayerEvents.TimeUpdated, { detail: this.currentTime }));
        console.log("MP4 player time updated:", this.currentTime);
        break;
    }
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
