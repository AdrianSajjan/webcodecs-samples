import { RuntimeEvents, RuntimeMessage } from "@/types/events";

type Status = "idle" | "pending" | "ready" | "error";
type PlaybackState = "playing" | "paused" | "ended";

export class MP4Player {
  uri: string;
  status: Status;
  playback: PlaybackState;

  private worker: Worker;
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;

  private codedWidth: number;
  private codedHeight: number;
  private resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, uri: string) {
    this.uri = uri;
    this.status = "idle";
    this.playback = "paused";

    this.canvas = document.createElement("canvas");
    this.container = container;
    this.container.appendChild(this.canvas);

    this.codedWidth = 0;
    this.codedHeight = 0;

    this.resizeObserver = this.setupResizeObserver();
    this.worker = new Worker(new URL("../worker/mp4-player.ts", import.meta.url));
    this.handleSetupWorker();
  }

  static createInstance(container: HTMLElement, uri: string) {
    return new MP4Player(container, uri);
  }

  private handleSetupWorker() {
    const canvas = this.canvas.transferControlToOffscreen();
    this.worker.addEventListener("message", this.handleWorkerMessage.bind(this));
    this.worker.postMessage(
      {
        type: RuntimeEvents.SetupWorker,
        payload: { uri: this.uri, canvas },
      },
      [canvas]
    );
  }

  private handleCanvasResize(codecWidth: number, codecHeight: number) {
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    const videoAspectRatio = codecWidth / codecHeight;
    const containerAspectRatio = containerWidth / containerHeight;

    let newWidth: number;
    let newHeight: number;

    if (containerAspectRatio > videoAspectRatio) {
      newHeight = containerHeight;
      newWidth = containerHeight * videoAspectRatio;
    } else {
      newWidth = containerWidth;
      newHeight = containerWidth / videoAspectRatio;
    }

    newWidth = Math.floor(newWidth / 2) * 2;
    newHeight = Math.floor(newHeight / 2) * 2;

    this.canvas.style.width = `${newWidth}px`;
    this.canvas.style.height = `${newHeight}px`;

    this.codedWidth = codecWidth;
    this.codedHeight = codecHeight;
  }

  private setupResizeObserver() {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this.container && this.codedWidth && this.codedHeight) {
          this.handleCanvasResize(this.codedWidth, this.codedHeight);
          break;
        }
      }
    });
    resizeObserver.observe(this.container);
    return resizeObserver;
  }

  private handleWorkerMessage(event: MessageEvent<RuntimeMessage>) {
    switch (event.data.type) {
      case RuntimeEvents.SetupWorkerSuccess:
        console.log("MP4 player worker thread is ready");
        break;

      case RuntimeEvents.MP4WorkerStatus:
        this.status = event.data.payload as Status;
        console.log("MP4 player worker status:", this.status);
        break;

      case RuntimeEvents.MP4WorkerConfig:
        const config = event.data.payload as VideoDecoderConfig;
        this.handleCanvasResize(this.codedWidth, this.codedHeight);
        console.log("MP4 player worker config:", config);
        break;

      case RuntimeEvents.PlayVideoSuccess:
        console.log("MP4 player worker is playing");
        this.playback = "playing";
        break;

      case RuntimeEvents.PlayVideoError:
        console.log("MP4 player worker error");
        break;

      case RuntimeEvents.SeekVideoSuccess:
        console.log("MP4 player worker is seeking");
        break;

      case RuntimeEvents.SeekVideoError:
        console.log("MP4 player worker error");
        break;

      case RuntimeEvents.PauseVideoSuccess:
        console.log("MP4 player worker is paused");
        this.playback = "paused";
        break;

      case RuntimeEvents.PauseVideoError:
        console.log("MP4 player worker error");
        break;
    }
  }

  play() {
    this.worker.postMessage({ type: RuntimeEvents.PlayVideo });
  }

  pause() {
    this.worker.postMessage({ type: RuntimeEvents.PauseVideo });
  }

  seek(type: "frame" | "time", value: number) {
    this.worker.postMessage({ type: RuntimeEvents.SeekVideo, payload: { type, value } });
  }

  setPlaybackSpeed(speed: number) {
    this.worker.postMessage({ type: RuntimeEvents.PlaybackSpeed, payload: { speed } });
  }

  destroy() {
    this.resizeObserver.disconnect();
  }
}
