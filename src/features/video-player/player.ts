import type { RuntimeMessage } from "@/shared/types/events";
import { waitUnitWorkerEvent } from "@/shared/libs/utils";

import { VideoPlayerEvents } from "./constants/events";
import { MP4FileMetadata } from "./demuxer";

type Status = "idle" | "pending" | "ready" | "error";

type PlaybackState = "playing" | "paused" | "ended";

export class MP4Player {
  status: Status;
  playback: PlaybackState;

  uri: string;
  originalWidth: number;
  originalHeight: number;

  metadata: MP4FileMetadata | null;
  config: VideoDecoderConfig | null;

  worker: Worker;
  canvas: HTMLCanvasElement;

  container?: HTMLElement;
  resizeObserver?: ResizeObserver;

  constructor(uri: string, container?: HTMLElement) {
    this.uri = uri;
    this.status = "idle";
    this.playback = "paused";

    this.canvas = document.createElement("canvas");
    this.container = container;
    this.container?.appendChild(this.canvas);

    this.originalWidth = 0;
    this.originalHeight = 0;

    this.metadata = null;
    this.config = null;

    this.resizeObserver = this.setupResizeObserver();
    this.worker = new Worker(new URL("./worker.ts", import.meta.url));
    this.handleSetupWorker();
  }

  static createInstance(uri: string, container?: HTMLElement) {
    return new MP4Player(uri, container);
  }

  private handleSetupWorker() {
    const canvas = this.canvas.transferControlToOffscreen();
    this.worker.addEventListener("message", this.handleWorkerMessage.bind(this));
    this.worker.postMessage(
      {
        type: VideoPlayerEvents.SetupWorker,
        payload: { uri: this.uri, canvas },
      },
      [canvas]
    );
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
        this.status = event.data.payload as Status;
        console.log("MP4 player status:", this.status);
        break;

      case VideoPlayerEvents.VideoConfig:
        this.config = event.data.payload as VideoDecoderConfig;
        this.handleCanvasResize(this.config.codedWidth || 0, this.config.codedHeight || 0);
        console.log("MP4 player config:", this.config);
        break;

      case VideoPlayerEvents.VideoMetadata:
        this.metadata = event.data.payload as MP4FileMetadata;
        console.log("MP4 player metadata:", this.metadata);
        break;

      case VideoPlayerEvents.VideoEnded:
        this.playback = "ended";
        console.log("MP4 player ended");
        break;

      case VideoPlayerEvents.FrameUpdated:
        console.log("MP4 player frame updated:", event.data.payload.frame);
        break;

      case VideoPlayerEvents.TimeUpdated:
        console.log("MP4 player time updated:", event.data.payload.time);
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
    this.resizeObserver?.disconnect();
  }
}
