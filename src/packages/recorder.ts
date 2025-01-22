import * as MuxerMP4 from "mp4-muxer";
import { assert } from "@/libs/utils";

const mTargetWidth = 1920;
const mTargetHeight = 1080;

const mFrameRatePerSecond = 30;
const mVideoBitrate = 8_000_000;
const mFrameInterval = 1000 / mFrameRatePerSecond;

const mAudioBitrate = 128_000;
const mAudioSampleRate = 48_000;
const mAudioNumberOfChannels = 2;

export interface RecordStreamProps {
  videoTrackSettings: MediaTrackSettings;
  videoReadableStream: ReadableStream<VideoFrame>;
  audioTrackSettings?: MediaTrackSettings;
  audioReadableStream?: ReadableStream<AudioData>;
}

export class Recorder {
  recording: boolean;

  private canvas: OffscreenCanvas;
  private context: OffscreenCanvasRenderingContext2D;

  private startTime: number;
  private encodedFrames: number;
  private lastFrameTime: number;
  private droppedFrames: number;

  private maxFPS: number;
  private averageFPS: number;
  private minFPS: number;
  private targetFPS: number;
  private targetFrameInterval: number;

  private videoEncoder?: VideoEncoder;
  private videoTrackSettings?: MediaTrackSettings;
  private videoReadableStream?: ReadableStream<VideoFrame>;
  private videoWritableStream?: WritableStream<VideoFrame>;

  private audioEncoder?: AudioEncoder;
  private audioTrackSettings?: MediaTrackSettings;
  private audioReadableStream?: ReadableStream<AudioData>;
  private audioWritableStream?: WritableStream<AudioData>;

  private intervalHandle?: NodeJS.Timeout;
  private muxerMP4?: MuxerMP4.Muxer<MuxerMP4.ArrayBufferTarget>;
  // private muxerWEBM?: MuxerMP4.Muxer<MuxerMP4.ArrayBufferTarget>;

  constructor() {
    this.recording = false;

    this.startTime = 0;
    this.encodedFrames = 0;
    this.lastFrameTime = 0;
    this.droppedFrames = 0;

    this.averageFPS = 0;
    this.targetFPS = mFrameRatePerSecond;
    this.minFPS = Number.MAX_SAFE_INTEGER;
    this.maxFPS = Number.MIN_SAFE_INTEGER;
    this.targetFrameInterval = mFrameInterval;

    this.canvas = new OffscreenCanvas(mTargetWidth, mTargetHeight);
    this.context = this.canvas.getContext("2d", { alpha: false })!;
  }

  static createInstance() {
    return new Recorder();
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

  private muxerAudioConfig(): MuxerMP4.MuxerOptions<MuxerMP4.ArrayBufferTarget>["audio"] {
    if (this.audioTrackSettings) {
      return {
        codec: "aac",
        sampleRate: this.audioTrackSettings.sampleRate || mAudioSampleRate,
        numberOfChannels: this.audioTrackSettings.channelCount || mAudioNumberOfChannels,
      };
    }
  }

  private async handleSetupAudioWriter() {
    if (!this.audioReadableStream) return;

    // Setup the audio writer
    this.audioWritableStream = new WritableStream<AudioData>(
      {
        write: async (data) => {
          assert(this.audioEncoder);
          if (this.audioEncoder.encodeQueueSize <= 2) this.audioEncoder.encode(data);
          data.close();
        },
        close: () => {
          console.log("Audio stream closed, cleaning up...");
        },
        abort: (reason) => {
          console.log("Audio stream aborted:", reason);
        },
      },
      new CountQueuingStrategy({
        highWaterMark: 1,
      })
    );

    // Pipe the audio stream to the audio writer
    await this.audioReadableStream.pipeTo(this.audioWritableStream);
  }

  private handleCaptureCanvasFrame() {
    assert(this.videoEncoder);

    // Check if the queue is not full
    if (this.videoEncoder.encodeQueueSize <= 10) {
      const currentTime = performance.now();
      const durationInSeconds = (currentTime - this.startTime) / 1000;

      // Ensure there is a keyframe every 2 seconds and ensure equally spaced frames every 1/fps of a second seconds
      const keyframe = this.encodedFrames % (this.targetFPS * 2) === 0;
      const timestamp = (this.encodedFrames * 1e6) / this.targetFPS;
      const frame = new VideoFrame(this.canvas, { timestamp, duration: 1e6 / this.targetFPS, alpha: "discard" });

      try {
        this.encodedFrames++;
        this.lastFrameTime = currentTime;
        this.videoEncoder.encode(frame, { keyFrame: keyframe });

        if (this.encodedFrames % this.targetFPS === 0) {
          this.averageFPS = this.encodedFrames / durationInSeconds;
          this.minFPS = Math.min(this.minFPS, this.averageFPS);
          this.maxFPS = Math.max(this.maxFPS, this.averageFPS);

          console.log("Last frame time:", this.lastFrameTime);
          console.log("Duration seconds:", durationInSeconds.toFixed(2));
          console.log("Encoded frames:", this.encodedFrames);

          console.log("Min FPS:", this.minFPS);
          console.log("Current FPS:", this.averageFPS);
          console.log("Max FPS:", this.maxFPS);
        }
      } catch (error) {
        if (this.intervalHandle) {
          clearInterval(this.intervalHandle);
          this.intervalHandle = undefined;
        }
        console.warn(error);
      }

      // Close the frame after it has been used
      frame.close();
    } else {
      console.warn("Dropped a frame, total dropped frames:", this.droppedFrames);
      this.droppedFrames++;
    }
  }

  private handleEncodeCanvasFrame() {
    this.intervalHandle = setInterval(() => {
      this.handleCaptureCanvasFrame();
    }, this.targetFrameInterval);
  }

  async handleSetupCanvasWriter() {
    assert(this.videoReadableStream);

    // Setup the canvas writer
    this.videoWritableStream = new WritableStream<VideoFrame>(
      {
        write: async (frame) => {
          this.context.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
          frame.close();
        },
        abort: (reason) => {
          console.log("Video stream aborted:", reason);
        },
        close: () => {
          console.log("Video stream closed, cleaning up...");
        },
      },
      new CountQueuingStrategy({
        highWaterMark: 1,
      })
    );

    // Pipe the video stream to the canvas writer
    await this.videoReadableStream.pipeTo(this.videoWritableStream);
  }

  async handleRecordStream({
    videoReadableStream,
    audioReadableStream,
    audioTrackSettings,
    videoTrackSettings,
  }: RecordStreamProps) {
    // Initialize the video state
    this.videoTrackSettings = videoTrackSettings;
    this.videoReadableStream = videoReadableStream;

    // Initialize the audio state
    this.audioTrackSettings = audioTrackSettings;
    this.audioReadableStream = audioReadableStream;

    // Initialize the canvas state
    const dimensions = this.scaleResolution(
      this.videoTrackSettings.width || mTargetWidth,
      this.videoTrackSettings.height || mTargetHeight
    );
    this.canvas.width = dimensions.width;
    this.canvas.height = dimensions.height;

    // Initialize FPS and Bitrate
    this.targetFPS = videoTrackSettings.frameRate || mFrameRatePerSecond;
    this.targetFrameInterval = 1000 / this.targetFPS;
    console.log("Target FPS:", this.targetFPS);
    console.log("Target frame interval:", this.targetFrameInterval);

    // Initialize the muxer
    this.muxerMP4 = new MuxerMP4.Muxer({
      target: new MuxerMP4.ArrayBufferTarget(),
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
      video: {
        codec: "avc",
        width: this.canvas.width,
        height: this.canvas.height,
        frameRate: this.targetFPS,
      },
      audio: this.muxerAudioConfig(),
    });

    // Initialize the video encoder
    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        this.muxerMP4!.addVideoChunk(chunk, meta);
      },
      error: (error) => {
        console.warn("Failed to write chunk:", error);
      },
    });

    // Configure the video encoder and check if the config is supported
    const config: VideoEncoderConfig = {
      bitrate: mVideoBitrate,
      codec: "avc1.64002A",
      width: this.canvas.width,
      framerate: this.targetFPS,
      height: this.canvas.height,
    };

    const support = await VideoEncoder.isConfigSupported(config);
    console.assert(support.supported);
    this.videoEncoder.configure(config);

    // Initialize the audio encoder
    if (this.audioReadableStream) {
      this.audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          this.muxerMP4!.addAudioChunk(chunk, meta);
        },
        error: (error) => {
          console.warn("Failed to write chunk:", error);
        },
      });

      // Configure the audio encoder and check if the config is supported
      const config: AudioEncoderConfig = {
        codec: "mp4a.40.2",
        numberOfChannels: this.audioTrackSettings?.channelCount || mAudioNumberOfChannels,
        sampleRate: this.audioTrackSettings?.sampleRate || mAudioSampleRate,
        bitrate: mAudioBitrate,
      };

      const support = await AudioEncoder.isConfigSupported(config);
      console.assert(support.supported);
      this.audioEncoder.configure(config);
    }

    // Set the recording states
    this.recording = true;
    this.encodedFrames = 0;
    this.lastFrameTime = 0;
    this.startTime = performance.now();

    // Draw the stream to canvas and pass the frames to the encoder
    this.handleSetupCanvasWriter();
    this.handleEncodeCanvasFrame();
    this.handleSetupAudioWriter();
  }

  async handleSaveStream() {
    this.recording = false;
    this.handleLogRecordingStats();
    this.resetRecorderStats();

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    if (this.audioEncoder) {
      await this.audioEncoder.flush();
      this.audioEncoder.close();
    }

    assert(this.videoEncoder);
    await this.videoEncoder.flush();
    this.videoEncoder.close();

    assert(this.muxerMP4);
    this.muxerMP4.finalize();
    return this.muxerMP4.target.buffer;
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
}
