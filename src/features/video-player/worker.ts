import type { RuntimeMessage } from "@/shared/types/events";
import type { MP4AudioMetadata, MP4Demuxer, MP4VideoMetadata } from "./demuxer";
import type { Renderer } from "./interfaces/renderer";

type Status = "idle" | "pending" | "ready" | "error";
type PlaybackStatus = "playing" | "paused" | "ended" | "idle";

class MP4Worker {
  uri!: string;
  status: Status;
  canvas!: OffscreenCanvas;

  reverse: boolean;
  seeking: boolean;
  seekResolver!: PromiseWithResolvers<void>;
  reverseResolver!: PromiseWithResolvers<void>;

  speed: number;
  frameIndex: number;
  frameInterval: number;
  reverseFrameIndex: number;

  imageDataBuffer: ImageData[];
  audioChunks: EncodedAudioChunk[];
  videoChunks: EncodedVideoChunk[];

  videoMetadata!: MP4VideoMetadata;
  audioMetadata?: MP4AudioMetadata;

  playback: PlaybackStatus;
  pendingFrame: VideoFrame | null;
  intervalId: NodeJS.Timeout | null;

  demuxer!: MP4Demuxer;
  videoDecoder!: VideoDecoder;
  audioDecoder!: AudioDecoder;

  renderer!: Renderer;
  offscreen!: Renderer;

  static createInstance() {
    return new MP4Worker();
  }

  constructor() {
    this.status = "idle";
    this.playback = "idle";
    this.seeking = false;
    this.reverse = false;

    this.videoChunks = [];
    this.audioChunks = [];
    this.imageDataBuffer = [];

    this.frameInterval = 0;
    this.frameIndex = 0;
    this.reverseFrameIndex = 0;
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

      case VideoPlayerEvents.PlayVideoReverse: {
        this.handlePlayReverse();
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

      case VideoPlayerEvents.NextFrame: {
        this.handlePaintNextFrame();
        break;
      }
    }
  }

  async handleSetupRenderer() {
    const { Canvas2DRenderer } = await import("./renderer/2d");
    const offscreen = new OffscreenCanvas(this.canvas.width, this.canvas.height);
    this.renderer = Canvas2DRenderer.createInstance(this.canvas);
    this.offscreen = Canvas2DRenderer.createInstance(offscreen, { willReadFrequently: true });
  }

  handleSetupDecoder() {
    this.videoDecoder = new VideoDecoder({
      output: this.handleVideoDecoderOutput.bind(this),
      error: this.handleDecoderError.bind(this),
    });
  }

  handleVideoDecoderOutput(frame: VideoFrame) {
    if (this.seeking) {
      frame.close();
    } else {
      this.handleRenderFrame(frame);
      if (this.reverse) {
        this.reverseResolver.resolve();
      }
    }

    if (this.seekResolver) {
      this.seekResolver.resolve();
    }
  }

  handleDecoderError(error: Error) {
    console.warn(error);
    this.handleUpdateStatus("error");
  }

  handleRenderFrame(frame: VideoFrame) {
    this.pendingFrame = frame;
    this.renderAnimationFrame();
  }

  renderAnimationFrame() {
    if (this.pendingFrame) {
      if (this.reverse) {
        this.offscreen.draw(this.pendingFrame);
        const data = this.offscreen.context.getImageData(0, 0, this.offscreen.canvas.width, this.offscreen.canvas.height);
        this.imageDataBuffer[this.reverseFrameIndex] = data;
      } else {
        this.renderer.draw(this.pendingFrame);
      }
      this.pendingFrame.close();
      this.pendingFrame = null;
    }
  }

  handleUpdateStatus(status: Status) {
    this.status = status;
    import("./constants/events").then(({ VideoPlayerEvents }) =>
      self.postMessage({ type: VideoPlayerEvents.VideoStatus, payload: { status: this.status } })
    );
  }

  async handleSetupDemuxer() {
    const { MP4Demuxer } = await import("./demuxer");

    this.demuxer = MP4Demuxer.createInstance(this.uri, {
      onVideoConfig: this.handleVideoConfig.bind(this),
      onVideoChunk: this.handleVideoChunk.bind(this),
      onVideoMetadata: this.handleVideoMetadata.bind(this),
      onAudioChunk: this.handleAudioChunk.bind(this),
    });
  }

  handleVideoChunk(chunk: EncodedVideoChunk) {
    this.videoChunks.push(chunk);
    this.handleCheckReadyStatus();
  }

  handleAudioChunk(chunk: EncodedAudioChunk) {
    this.audioChunks.push(chunk);
    this.handleCheckReadyStatus();
  }

  handleCheckReadyStatus() {
    if (
      this.videoChunks.length !== this.videoMetadata.frames ||
      (this.audioMetadata && this.audioChunks.length !== this.audioMetadata.samples)
    )
      return;
    this.handleUpdateStatus("ready");
  }

  handleVideoConfig(config: VideoDecoderConfig) {
    import("./constants/events").then(({ VideoPlayerEvents }) =>
      self.postMessage({ type: VideoPlayerEvents.VideoConfig, payload: { config } })
    );
    this.videoDecoder.configure(config);
  }

  handleVideoMetadata(metadata: MP4VideoMetadata) {
    import("./constants/events").then(({ VideoPlayerEvents }) =>
      self.postMessage({ type: VideoPlayerEvents.VideoMetadata, payload: { metadata } })
    );

    this.videoMetadata = metadata;
    this.frameInterval = 1000 / this.videoMetadata.fps;
  }

  handlePlay() {
    if (this.videoChunks.length === 0) {
      import("./constants/events").then(({ VideoPlayerEvents }) =>
        self.postMessage({
          type: VideoPlayerEvents.PlayVideoError,
          payload: { error: "Please wait for the video to load" },
        })
      );
      return;
    }

    if (this.playback === "playing") {
      if (!this.reverse) {
        import("./constants/events").then(({ VideoPlayerEvents }) => self.postMessage({ type: VideoPlayerEvents.PlayVideoSuccess }));
        return;
      }
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.reverse = false;
    this.playback = "playing";
    this.frameIndex = this.frameIndex === this.videoMetadata.frames - 1 ? 0 : this.frameIndex;

    this.handlePlayInterval();
    import("./constants/events").then(({ VideoPlayerEvents }) => self.postMessage({ type: VideoPlayerEvents.PlayVideoSuccess }));
  }

  async handlePlayReverse() {
    if (this.videoChunks.length === 0) {
      import("./constants/events").then(({ VideoPlayerEvents }) =>
        self.postMessage({
          type: VideoPlayerEvents.PlayVideoReverseError,
          payload: { error: "Please wait for the video to load" },
        })
      );
      return;
    }

    if (this.playback === "playing") {
      if (this.reverse) {
        import("./constants/events").then(({ VideoPlayerEvents }) => self.postMessage({ type: VideoPlayerEvents.PlayVideoReverseSuccess }));
        return;
      }
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.reverse = true;
    this.reverseFrameIndex = 0;
    this.frameIndex = this.frameIndex === 0 ? this.videoMetadata.frames - 1 : this.frameIndex;

    while (this.reverseFrameIndex <= this.frameIndex) {
      if (!this.imageDataBuffer[this.reverseFrameIndex]) {
        const chunk = this.videoChunks[this.reverseFrameIndex];
        if (chunk) {
          this.reverseResolver = Promise.withResolvers();
          this.videoDecoder.decode(chunk);
          await this.reverseResolver.promise;
        }
      }
      this.reverseFrameIndex++;
    }

    this.handlePlayReverseInterval();
    import("./constants/events").then(({ VideoPlayerEvents }) => self.postMessage({ type: VideoPlayerEvents.PlayVideoReverseSuccess }));
  }

  handlePlayInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      if (this.frameIndex >= this.videoMetadata.frames) {
        this.handleEnded();
      } else {
        const chunk = this.videoChunks[this.frameIndex];
        if (chunk) {
          this.seekResolver = Promise.withResolvers();
          this.videoDecoder.decode(chunk);
          await this.seekResolver.promise;
        }
        this.frameIndex++;

        import("./constants/events").then(({ VideoPlayerEvents }) => {
          self.postMessage({ type: VideoPlayerEvents.FrameUpdated, payload: { frame: this.frameIndex } });
          self.postMessage({ type: VideoPlayerEvents.TimeUpdated, payload: { time: this.frameIndex / this.videoMetadata.fps } });
        });
      }
    }, this.frameInterval / this.speed);
  }

  handlePlayReverseInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      if (this.frameIndex === 0) {
        this.handleEnded();
      } else {
        const data = this.imageDataBuffer[this.frameIndex];
        if (data) this.renderer.context.putImageData(data, 0, 0);
        this.frameIndex--;

        import("./constants/events").then(({ VideoPlayerEvents }) => {
          self.postMessage({ type: VideoPlayerEvents.FrameUpdated, payload: { frame: this.frameIndex } });
          self.postMessage({ type: VideoPlayerEvents.TimeUpdated, payload: { time: this.frameIndex / this.videoMetadata.fps } });
        });
      }
    }, this.frameInterval / this.speed);
  }

  handleEnded() {
    if (this.playback === "ended") return;
    this.playback = "ended";

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    import("./constants/events").then(({ VideoPlayerEvents }) => self.postMessage({ type: VideoPlayerEvents.VideoEnded }));
  }

  handlePause() {
    if (this.playback === "paused") return;
    this.playback = "paused";

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    import("./constants/events").then(({ VideoPlayerEvents }) => self.postMessage({ type: VideoPlayerEvents.PauseVideoSuccess }));
  }

  handlePlaybackSpeed(speed: number) {
    this.speed = speed;

    if (this.intervalId) clearInterval(this.intervalId);
    if (this.playback === "playing") this.handlePlayInterval();

    import("./constants/events").then(({ VideoPlayerEvents }) => self.postMessage({ type: VideoPlayerEvents.PlaybackSpeedSuccess }));
  }

  async handleSeek(type: "frame" | "time", value: number) {
    const playing = this.playback === "playing";

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.reverse = false;
    this.seeking = true;

    const converted = type === "time" ? value * this.videoMetadata.fps : value;
    const frame = Math.max(0, Math.min(this.videoMetadata.frames - 1, converted));
    const chunk = this.videoChunks[frame];

    if (!chunk) {
      import("./constants/events").then(({ VideoPlayerEvents }) =>
        self.postMessage({ type: VideoPlayerEvents.SeekVideoError, payload: { error: "No chunk found" } })
      );
      return;
    }

    if (chunk.type === "key") {
      this.seeking = false;
      this.seekResolver = Promise.withResolvers();
      this.videoDecoder.decode(chunk);
      await this.seekResolver.promise;
    } else {
      const result = this.handleFindClosestKeyFrame(frame);
      if (!result.chunk) {
        import("./constants/events").then(({ VideoPlayerEvents }) =>
          self.postMessage({ type: VideoPlayerEvents.SeekVideoError, payload: { error: "No key frame found" } })
        );
        return;
      }

      let index = result.index;

      while (index < frame) {
        const chunk = this.videoChunks[index];
        if (chunk) {
          this.seekResolver = Promise.withResolvers();
          this.videoDecoder.decode(chunk);
          await this.seekResolver.promise;
        }
        index++;
      }

      this.seeking = false;
      this.frameIndex = frame;

      this.seekResolver = Promise.withResolvers();
      this.videoDecoder.decode(chunk);
      await this.seekResolver.promise;
    }

    if (playing) {
      this.handlePlayInterval();
    }

    import("./constants/events").then(({ VideoPlayerEvents }) => self.postMessage({ type: VideoPlayerEvents.SeekVideoSuccess }));
  }

  async handlePaintNextFrame() {
    if (this.frameIndex >= this.videoMetadata.frames) {
      import("./constants/events").then(({ VideoPlayerEvents }) =>
        self.postMessage({ type: VideoPlayerEvents.NextFrameError, payload: { error: "End of frames reached" } })
      );
      return;
    }

    let retries = 0;
    const maxRetries = 5;
    const chunk = this.videoChunks[this.frameIndex];

    console.log("PAINTING", this.frameIndex);

    if (chunk) {
      while (true) {
        if (retries >= maxRetries) {
          import("./constants/events").then(({ VideoPlayerEvents }) =>
            self.postMessage({ type: VideoPlayerEvents.NextFrameError, payload: { error: "Timed out while decoding frame" } })
          );
          break;
        }

        let retrying = false;
        this.seekResolver = Promise.withResolvers();
        this.videoDecoder.decode(chunk);

        const id = setTimeout(() => {
          retries++;
          retrying = true;
          this.seekResolver.resolve();
        }, 1000);

        await this.seekResolver.promise;
        if (!retrying) {
          clearTimeout(id);
          break;
        }
      }
    }

    const bitmap = this.renderer.canvas.transferToImageBitmap();
    this.frameIndex++;

    import("./constants/events").then(({ VideoPlayerEvents }) => {
      self.postMessage({ type: VideoPlayerEvents.NextFrameSuccess, payload: { frame: this.frameIndex, bitmap } }, [bitmap]);
    });
  }

  handleFindClosestKeyFrame(index: number) {
    for (let idx = index - 1; idx >= 0; idx--) {
      const chunk = this.videoChunks[idx];
      if (chunk.type === "key") return { index: idx, chunk };
    }
    return { index: -1, chunk: null };
  }
}

MP4Worker.createInstance();
