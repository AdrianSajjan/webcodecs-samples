import * as MuxerMP4 from "mp4-muxer";

const mTargetWidth = 1280;
const mTargetHeight = 720;

const mFrameRatePerSecond = 30;
const mFrameInterval = 1000 / mFrameRatePerSecond;
const mVideoBitrate = 6_000_000;

const mAudioBitrate = 128_000;
const mAudioSampleRate = 48_000;
const mAudioNumberOfChannels = 2;

class Core {
  recording: boolean;

  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  private startTime: number;
  private encodedFrames: number;
  private lastFrameTime: number;
  private droppedFrames: number;

  private maxFPS: number;
  private averageFPS: number;
  private minFPS: number;

  private requestAnimationHandle?: number;
  private intervalHandle?: NodeJS.Timeout;

  private userStream?: MediaStream;
  private desktopStream?: MediaStream;

  private videoFrame?: VideoFrame;
  private videoEncoder?: VideoEncoder;
  private videoWritableStream?: WritableStream<VideoFrame>;

  private audioEncoder?: AudioEncoder;
  private audioWritableStream?: WritableStream<AudioData>;

  private muxerMP4?: MuxerMP4.Muxer<MuxerMP4.ArrayBufferTarget>;
  private muxerWEBM?: MuxerMP4.Muxer<MuxerMP4.ArrayBufferTarget>;

  constructor(canvas: HTMLCanvasElement) {
    this.recording = false;

    this.startTime = 0;
    this.encodedFrames = 0;
    this.lastFrameTime = 0;
    this.droppedFrames = 0;

    this.averageFPS = 0;
    this.minFPS = Number.MAX_SAFE_INTEGER;
    this.maxFPS = Number.MIN_SAFE_INTEGER;

    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false, desynchronized: true })!;
  }

  static createInstance(canvas: HTMLCanvasElement) {
    return new Core(canvas);
  }

  private get videoTrack() {
    return this.desktopStream?.getVideoTracks()[0];
  }

  private get audioTrack() {
    return this.desktopStream?.getAudioTracks()[0];
  }

  private resetRecorderStats() {
    this.startTime = 0;
    this.encodedFrames = 0;
    this.lastFrameTime = 0;
    this.droppedFrames = 0;

    this.averageFPS = 0;
    this.minFPS = Number.MAX_SAFE_INTEGER;
    this.maxFPS = Number.MIN_SAFE_INTEGER;
  }

  private scaleResolution(width: number, height: number) {
    let scaledWidth = width;
    let scaledHeight = height;

    if (width > mTargetWidth || height > mTargetHeight) {
      const widthRatio = mTargetWidth / width;
      const heightRatio = mTargetHeight / height;

      const scale = Math.min(widthRatio, heightRatio);

      scaledWidth = Math.floor(width * scale);
      scaledHeight = Math.floor(height * scale);
    }

    scaledWidth = Math.floor(scaledWidth / 2) * 2;
    scaledHeight = Math.floor(scaledHeight / 2) * 2;

    return {
      width: scaledWidth,
      height: scaledHeight,
    };
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
    await this.handleSetupCanvasWriter();
  }

  async handleSetupCanvasWriter() {
    if (!this.videoTrack) return;

    this.videoWritableStream = new WritableStream<VideoFrame>({
      start: () => {
        this.requestAnimationHandle = requestAnimationFrame(this.handleDrawCanvasFrames.bind(this));
      },
      write: async (frame) => {
        if (this.videoFrame) this.videoFrame.close();
        this.videoFrame = frame;
      },
      abort: (reason) => {
        console.log("Stream aborted:", reason);
        this.handleCleanupCanvasWriter();
      },
      close: () => {
        console.log("Stream closed, cleaning up...");
        this.handleCleanupCanvasWriter();
      },
    });

    const processor = new MediaStreamTrackProcessor({ track: this.videoTrack });
    await processor.readable.pipeTo(this.videoWritableStream).catch((error) => {
      console.warn("Failed to pipe video stream to canvas writer:", error);
      this.handleCloseCanvasWriter();
    });
  }

  async handleDrawCanvasFrames() {
    const dimensions = this.scaleResolution(
      this.videoFrame?.displayWidth || 1920,
      this.videoFrame?.displayHeight || 1080
    );

    if (this.canvas.height !== dimensions.height) this.canvas.height = dimensions.height;
    if (this.canvas.width !== dimensions.width) this.canvas.width = dimensions.width;

    if (this.videoFrame) this.context.drawImage(this.videoFrame, 0, 0, this.canvas.width, this.canvas.height);
    this.requestAnimationHandle = requestAnimationFrame(this.handleDrawCanvasFrames.bind(this));
  }

  private handleCloseCanvasWriter() {
    if (!this.videoTrack) return;
    this.videoTrack.stop(); // Stopping the video track will trigger writable stream to close
  }

  private async handleCleanupCanvasWriter() {
    if (this.videoFrame) this.videoFrame.close();
    if (this.requestAnimationHandle) cancelAnimationFrame(this.requestAnimationHandle);
    this.requestAnimationHandle = undefined;
    this.videoFrame = undefined;
  }

  private muxerVideoConfig(): MuxerMP4.MuxerOptions<MuxerMP4.ArrayBufferTarget>["video"] {
    if (this.videoTrack) {
      return {
        codec: "avc",
        width: this.canvas.width,
        height: this.canvas.height,
        frameRate: mFrameRatePerSecond,
      };
    }
  }

  private muxerAudioConfig(): MuxerMP4.MuxerOptions<MuxerMP4.ArrayBufferTarget>["audio"] {
    if (this.audioTrack) {
      return {
        codec: "aac",
        sampleRate: this.audioTrack.getSettings().sampleRate || mAudioSampleRate,
        numberOfChannels: this.audioTrack.getSettings().channelCount || mAudioNumberOfChannels,
      };
    }
  }

  async handleRecordStream() {
    this.muxerMP4 = new MuxerMP4.Muxer({
      target: new MuxerMP4.ArrayBufferTarget(),
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
      video: this.muxerVideoConfig(),
      audio: this.muxerAudioConfig(),
    });

    if (this.videoTrack) {
      this.videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          this.muxerMP4!.addVideoChunk(chunk, meta);
        },
        error: (error) => {
          console.warn("Failed to write chunk:", error);
        },
      });

      const config: VideoEncoderConfig = {
        bitrate: mVideoBitrate,
        codec: "avc1.64002A",
        framerate: mFrameRatePerSecond,
        width: this.canvas.width,
        height: this.canvas.height,
      };

      const support = await VideoEncoder.isConfigSupported(config);
      console.assert(support.supported);
      this.videoEncoder.configure(config);
    }

    if (this.audioTrack) {
      this.audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          this.muxerMP4!.addAudioChunk(chunk, meta);
        },
        error: (error) => {
          console.warn("Failed to write chunk:", error);
        },
      });

      const config: AudioEncoderConfig = {
        codec: "mp4a.40.2",
        numberOfChannels: this.audioTrack.getSettings().channelCount || mAudioNumberOfChannels,
        sampleRate: this.audioTrack.getSettings().sampleRate || mAudioSampleRate,
        bitrate: mAudioBitrate,
      };

      const support = await AudioEncoder.isConfigSupported(config);
      console.assert(support.supported);
      this.audioEncoder.configure(config);
    }

    this.recording = true;
    this.encodedFrames = 0;
    this.lastFrameTime = 0;
    this.startTime = performance.now();

    this.handleEncodeCanvasFrame();
    this.handleEncodeAudioFrame();
  }

  private async handleEncodeAudioFrame() {
    if (!this.audioTrack || !this.audioEncoder) return;

    const processor = new MediaStreamTrackProcessor({ track: this.audioTrack });
    this.audioWritableStream = new WritableStream<AudioData>({
      write: async (audioData) => {
        if (this.audioEncoder!.encodeQueueSize <= 2) this.audioEncoder!.encode(audioData);
        audioData.close();
      },
    });
    await processor.readable.pipeTo(this.audioWritableStream).catch((error) => {
      console.warn("Failed to pipe audio stream to audio writer:", error);
      this.handleCloseAudioWriter();
    });
  }

  private handleCloseAudioWriter() {
    if (!this.audioTrack) return;
    this.audioTrack.stop(); // Stopping the audio track will trigger writable stream to close
  }

  async handleEncodeCanvasFrame() {
    this.intervalHandle = setInterval(() => {
      if (!this.videoEncoder || !this.recording) {
        if (this.intervalHandle) {
          clearInterval(this.intervalHandle);
          this.intervalHandle = undefined;
        }
        return;
      }

      const currentTime = performance.now();
      const durationInSeconds = (currentTime - this.startTime) / 1000;

      const frame = new VideoFrame(this.canvas, {
        timestamp: Math.round(currentTime * 1000),
        alpha: "discard",
      });

      if (this.videoEncoder.encodeQueueSize <= 2) {
        const keyFrame = this.encodedFrames % mFrameRatePerSecond === 0;
        this.videoEncoder.encode(frame, { keyFrame });

        this.encodedFrames++;
        this.lastFrameTime = currentTime;

        if (this.encodedFrames % 120 === 0) {
          this.averageFPS = this.encodedFrames / durationInSeconds;
          this.minFPS = Math.min(this.minFPS, this.averageFPS);
          this.maxFPS = Math.max(this.maxFPS, this.averageFPS);

          console.log("Duration seconds:", durationInSeconds.toFixed(2));
          console.log("Encoded frames:", this.encodedFrames);
          console.log("Current FPS:", this.averageFPS);
          console.log("Min FPS:", this.minFPS);
          console.log("Max FPS:", this.maxFPS);
        }
      } else {
        console.warn("Dropped a frame, total dropped frames:", this.droppedFrames);
        this.droppedFrames++;
      }

      frame.close();
    }, mFrameInterval);
  }

  async handleSaveStream() {
    this.recording = false;
    this.handleLogRecordingStats();
    this.resetRecorderStats();

    this.handleCloseCanvasWriter();
    this.handleCloseAudioWriter();

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    if (this.audioEncoder) {
      await this.audioEncoder.flush();
      this.audioEncoder.close();
    }

    if (this.videoEncoder) {
      await this.videoEncoder.flush();
      this.videoEncoder.close();
    }

    if (this.muxerMP4) {
      this.muxerMP4.finalize();
      this.handleSaveBuffer(this.muxerMP4.target.buffer);
    }
  }

  handleLogRecordingStats() {
    const duration = (performance.now() - this.startTime) / 1000;

    console.log("Recording finished, stats below:");
    console.log("Total frames:", this.encodedFrames);
    console.log("Duration seconds:", duration.toFixed(2));
    console.log("Dropped frames:", this.droppedFrames);

    console.log("Average FPS:", this.averageFPS);
    console.log("Min FPS:", this.minFPS);
    console.log("Max FPS:", this.maxFPS);
  }

  handleSaveBuffer(buffer: ArrayBuffer) {
    const blob = new Blob([buffer], { type: "video/mp4" });
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

  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const core = Core.createInstance(canvas);

  const saveButton = document.getElementById("save") as HTMLButtonElement;
  const captureButton = document.getElementById("capture") as HTMLButtonElement;
  const recordButton = document.getElementById("record") as HTMLButtonElement;

  saveButton.addEventListener("click", () => {
    core.handleSaveStream();
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  });

  captureButton.addEventListener("click", () => {
    core.handleCaptureStream();
    captureButton.disabled = true;
    captureButton.textContent = "Capturing...";
  });

  recordButton.addEventListener("click", () => {
    core.handleRecordStream();
    recordButton.disabled = true;
    recordButton.textContent = "Recording...";
  });
});
