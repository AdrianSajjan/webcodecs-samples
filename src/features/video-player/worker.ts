import type { RuntimeMessage } from "@/shared/types/events";
import type { MP4Demuxer, MP4FileMetadata } from "./demuxer";
import type { Renderer } from "./interfaces/player";

type Status = "idle" | "pending" | "ready" | "error";
type PlaybackStatus = "playing" | "paused" | "ended" | "idle";

class MP4Worker {
  uri!: string;
  status: Status;
  canvas!: OffscreenCanvas;

  seeking: boolean;
  seekResolver!: PromiseWithResolvers<void>;

  speed: number;
  frameIndex: number;
  frameInterval: number;
  chunks: EncodedVideoChunk[];

  metadata!: MP4FileMetadata;
  playback: PlaybackStatus;
  pendingFrame: VideoFrame | null;
  intervalId: NodeJS.Timeout | null;

  demuxer!: MP4Demuxer;
  renderer!: Renderer;
  decoder!: VideoDecoder;

  static createInstance() {
    return new MP4Worker();
  }

  constructor() {
    this.status = "idle";
    this.playback = "idle";
    this.seeking = false;

    this.chunks = [];
    this.frameInterval = 0;
    this.frameIndex = 0;
    this.speed = 1;

    this.pendingFrame = null;
    this.intervalId = null;

    self.addEventListener("message", this.handleWorkerMessage.bind(this));
  }

  async handleWorkerMessage(event: MessageEvent<RuntimeMessage>) {
    const { VideoPlayerEvents } = await import("./constants/events");

    switch (event.data.type) {
      case VideoPlayerEvents.SetupWorker: {
        this.uri = event.data.payload.uri;
        this.canvas = event.data.payload.canvas;

        this.handleSetupDecoder();
        await this.handleSetupRenderer();
        await this.handleSetupDemuxer();

        self.postMessage({ type: VideoPlayerEvents.SetupWorkerSuccess });
        break;
      }

      case VideoPlayerEvents.PlayVideo: {
        this.handlePlay();
        break;
      }

      case VideoPlayerEvents.PauseVideo: {
        this.handlePause();
        break;
      }

      case VideoPlayerEvents.PlaybackSpeed: {
        this.handlePlaybackSpeed(event.data.payload.speed);
        break;
      }

      case VideoPlayerEvents.SeekVideo: {
        this.handleSeek(event.data.payload.type, event.data.payload.value);
        break;
      }
    }
  }

  async handleSetupRenderer() {
    const { Canvas2DRenderer } = await import("./renderer/2d");
    this.renderer = Canvas2DRenderer.createInstance(this.canvas);
  }

  handleSetupDecoder() {
    this.decoder = new VideoDecoder({
      output: this.handleDecoderOutput.bind(this),
      error: this.handleDecoderError.bind(this),
    });
  }

  handleDecoderOutput(frame: VideoFrame) {
    if (this.seeking) {
      this.seekResolver.resolve();
      frame.close();
    } else {
      this.handleRenderFrame(frame);
    }
  }

  handleDecoderError(error: Error) {
    console.warn(error);
    this.handleUpdateStatus("error");
  }

  handleRenderFrame(frame: VideoFrame) {
    if (!this.pendingFrame) {
      requestAnimationFrame(this.renderAnimationFrame.bind(this));
    } else {
      this.pendingFrame.close();
    }
    this.pendingFrame = frame;
  }

  renderAnimationFrame() {
    if (this.pendingFrame) {
      this.renderer.draw(this.pendingFrame);
      this.pendingFrame = null;
    }
  }

  async handleUpdateStatus(status: Status) {
    const { VideoPlayerEvents } = await import("./constants/events");
    this.status = status;
    self.postMessage({ type: VideoPlayerEvents.VideoStatus, payload: { status: this.status } });
  }

  async handleSetupDemuxer() {
    const { MP4Demuxer } = await import("./demuxer");

    this.demuxer = MP4Demuxer.createInstance(this.uri, {
      onConfig: this.handleDemuxerConfig.bind(this),
      onChunk: this.handleDemuxerChunk.bind(this),
      onMetadata: this.handleDemuxerMetadata.bind(this),
    });
  }

  handleDemuxerConfig(config: VideoDecoderConfig) {
    import("./constants/events").then(({ VideoPlayerEvents }) =>
      self.postMessage({ type: VideoPlayerEvents.VideoConfig, payload: { config } })
    );
    this.decoder.configure(config);
  }

  handleDemuxerChunk(chunk: EncodedVideoChunk) {
    this.chunks.push(chunk);
    if (this.chunks.length === this.metadata?.frames) this.handleUpdateStatus("ready");
  }

  handlePlay() {
    if (this.playback === "playing") return;

    if (this.chunks.length === 0) {
      import("./constants/events").then(({ VideoPlayerEvents }) =>
        self.postMessage({
          type: VideoPlayerEvents.PlayVideoError,
          payload: { error: "Please wait for the video to load" },
        })
      );
      return;
    }

    this.playback = "playing";
    if (this.frameIndex === this.metadata?.frames) this.frameIndex = 0;
    this.handlePlayInterval();

    import("./constants/events").then(({ VideoPlayerEvents }) =>
      self.postMessage({ type: VideoPlayerEvents.PlayVideoSuccess })
    );
  }

  handlePlayInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      if (this.frameIndex >= this.metadata?.frames) {
        this.handlePause();
      } else {
        const chunk = this.chunks[this.frameIndex];
        if (chunk) this.decoder.decode(chunk);
        this.frameIndex++;
      }
    }, this.frameInterval / this.speed);
  }

  handlePause() {
    if (this.playback === "paused") return;
    this.playback = "paused";

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    import("./constants/events").then(({ VideoPlayerEvents }) =>
      self.postMessage({ type: VideoPlayerEvents.PauseVideoSuccess })
    );
  }

  handlePlaybackSpeed(speed: number) {
    this.speed = speed;
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.playback === "playing") this.handlePlayInterval();
  }

  async handleSeek(_: "frame" | "time", value: number) {
    const playing = this.playback === "playing";
    if (playing) this.handlePause();

    this.seeking = true;
    const frame = Math.max(0, Math.min(this.metadata?.frames - 1, value));
    const chunk = this.chunks[frame];

    if (!chunk) {
      import("./constants/events").then(({ VideoPlayerEvents }) =>
        self.postMessage({
          type: VideoPlayerEvents.SeekVideoError,
          payload: { error: "No chunk found" },
        })
      );
      return;
    }

    if (chunk.type === "key") {
      this.seeking = false;
      this.decoder.decode(chunk);
    } else {
      const result = this.handleFindClosestKeyFrame(frame);
      if (!result.chunk) {
        import("./constants/events").then(({ VideoPlayerEvents }) =>
          self.postMessage({
            type: VideoPlayerEvents.SeekVideoError,
            payload: { error: "No key frame found" },
          })
        );
        return;
      }

      let index = result.index;

      while (index < frame) {
        const chunk = this.chunks[index];
        if (chunk) {
          this.seekResolver = Promise.withResolvers();
          this.decoder.decode(chunk);
          await this.seekResolver.promise;
        }
        index++;
      }

      this.seeking = false;
      this.frameIndex = frame;
      this.decoder.decode(chunk);
    }

    if (playing) this.handlePlayInterval();
    import("./constants/events").then(({ VideoPlayerEvents }) =>
      self.postMessage({ type: VideoPlayerEvents.SeekVideoSuccess })
    );
  }

  handleFindClosestKeyFrame(index: number) {
    for (let idx = index - 1; idx >= 0; idx--) {
      const chunk = this.chunks[idx];
      if (chunk.type === "key") return { index: idx, chunk };
    }
    return { index: -1, chunk: null };
  }

  handleDemuxerMetadata(metadata: MP4FileMetadata) {
    import("./constants/events").then(({ VideoPlayerEvents }) =>
      self.postMessage({ type: VideoPlayerEvents.VideoMetadata, payload: { metadata } })
    );
    this.metadata = metadata;
    this.frameInterval = 1000 / this.metadata.fps;
  }
}

MP4Worker.createInstance();
