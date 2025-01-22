import * as MuxerMP4 from "mp4-muxer";
import * as MuxerWebM from "webm-muxer";
import { assert } from "@/libs/utils";

export interface RecordStreamProps {
  videoTrackSettings: MediaTrackSettings;
  videoReadableStream: ReadableStream<VideoFrame>;
  audioTrackSettings?: MediaTrackSettings;
  audioReadableStream?: ReadableStream<AudioData>;
}

type Muxer = MuxerMP4.Muxer<MuxerMP4.ArrayBufferTarget> | MuxerWebM.Muxer<MuxerWebM.ArrayBufferTarget>;

export class BaseRecorder<T extends Muxer> {
  protected readonly mAudioEncoderCodec: string = "";
  protected readonly mVideoEncoderCodec: string = "";

  protected readonly mVideoMuxerCodec: string = "";
  protected readonly mAudioMuxerCodec: string = "";

  protected readonly mTargetWidth = 1920;
  protected readonly mTargetHeight = 1080;

  protected readonly mFrameRatePerSecond = 30;
  protected readonly mVideoBitrate = 8_000_000;
  protected readonly mFrameInterval = 1000 / this.mFrameRatePerSecond;

  protected readonly mAudioBitrate = 128_000;
  protected readonly mAudioSampleRate = 48_000;
  protected readonly mAudioNumberOfChannels = 2;

  protected clone: boolean;
  protected recording: boolean;
  protected canvas: OffscreenCanvas;
  protected context: OffscreenCanvasRenderingContext2D;

  protected startTime: number;
  protected encodedFrames: number;
  protected lastFrameTime: number;
  protected droppedFrames: number;

  protected maxFPS: number;
  protected averageFPS: number;
  protected minFPS: number;
  protected targetFPS: number;
  protected targetFrameInterval: number;

  protected videoEncoder?: VideoEncoder;
  protected videoTrackSettings?: MediaTrackSettings;
  protected videoReadableStream?: ReadableStream<VideoFrame>;
  protected videoWritableStream?: WritableStream<VideoFrame>;

  protected audioEncoder?: AudioEncoder;
  protected audioTrackSettings?: MediaTrackSettings;
  protected audioReadableStream?: ReadableStream<AudioData>;
  protected audioWritableStream?: WritableStream<AudioData>;

  protected intervalHandle?: NodeJS.Timeout;
  protected muxer?: T;

  protected constructor(clone: boolean) {
    this.recording = false;
    this.clone = clone;

    this.startTime = 0;
    this.encodedFrames = 0;
    this.lastFrameTime = 0;
    this.droppedFrames = 0;

    this.averageFPS = 0;
    this.targetFPS = this.mFrameRatePerSecond;
    this.minFPS = Number.MAX_SAFE_INTEGER;
    this.maxFPS = Number.MIN_SAFE_INTEGER;
    this.targetFrameInterval = this.mFrameInterval;

    this.canvas = new OffscreenCanvas(this.mTargetWidth, this.mTargetHeight);
    this.context = this.canvas.getContext("2d", { alpha: false })!;
  }

  protected resetRecorderStats() {
    this.startTime = 0;
    this.encodedFrames = 0;
    this.lastFrameTime = 0;
    this.droppedFrames = 0;

    this.averageFPS = 0;
    this.minFPS = Number.MAX_SAFE_INTEGER;
    this.maxFPS = Number.MIN_SAFE_INTEGER;
  }

  protected scaleResolution(width: number, height: number) {
    let scaledWidth = width;
    let scaledHeight = height;

    if (width > this.mTargetWidth || height > this.mTargetHeight) {
      const widthRatio = this.mTargetWidth / width;
      const heightRatio = this.mTargetHeight / height;
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

  protected async handleSetupAudioWriter() {
    if (!this.audioReadableStream) return;

    // Setup the audio writer
    this.audioWritableStream = new WritableStream<AudioData>(
      {
        write: async (data) => {
          const frame = this.clone ? data.clone() : data;
          if (this.recording) {
            assert(this.audioEncoder);
            if (this.audioEncoder.encodeQueueSize <= 2) this.audioEncoder.encode(frame);
          }
          frame.close();
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

  protected handleCaptureCanvasFrame() {
    if (!this.recording) return;
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

  protected handleEncodeCanvasFrame() {
    this.intervalHandle = setInterval(() => {
      if (this.recording) {
        this.handleCaptureCanvasFrame();
      }
    }, this.targetFrameInterval);
  }

  protected handleSetupMuxer() {
    // Setup the muxer - override in subclasses
  }

  async handleSetupCanvasWriter() {
    assert(this.videoReadableStream);

    // Setup the canvas writer
    this.videoWritableStream = new WritableStream<VideoFrame>(
      {
        write: async (data) => {
          const frame = this.clone ? data.clone() : data;
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

  async handleCaptureStream(props: RecordStreamProps) {
    // Initialize the video state
    this.videoTrackSettings = props.videoTrackSettings;
    this.videoReadableStream = props.videoReadableStream;

    // Initialize the audio state
    this.audioTrackSettings = props.audioTrackSettings;
    this.audioReadableStream = props.audioReadableStream;

    // Extract the video dimensions
    const height = this.videoTrackSettings.height || this.mTargetHeight;
    const width = this.videoTrackSettings.width || this.mTargetWidth;

    // Initialize the canvas state
    const dimensions = this.scaleResolution(width, height);
    this.canvas.width = dimensions.width;
    this.canvas.height = dimensions.height;

    // Initialize FPS and Bitrate
    this.targetFPS = props.videoTrackSettings.frameRate || this.mFrameRatePerSecond;
    this.targetFrameInterval = 1000 / this.targetFPS;

    // Initialize the muxer - override in subclasses
    this.handleSetupMuxer();

    // Initialize the video encoder
    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (this.recording) {
          this.muxer!.addVideoChunk(chunk, meta);
        }
      },
      error: (error) => {
        console.warn("Failed to write chunk:", error);
      },
    });

    // Configure the video encoder and check if the config is supported
    const config: VideoEncoderConfig = {
      bitrate: this.mVideoBitrate,
      codec: this.mVideoEncoderCodec,
      width: this.canvas.width,
      framerate: this.targetFPS,
      height: this.canvas.height,
    };

    const support = await VideoEncoder.isConfigSupported(config);
    console.assert(support.supported, "Video config not supported:", config);
    this.videoEncoder.configure(config);

    // Initialize the audio encoder
    if (this.audioTrackSettings) {
      this.audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          if (this.recording) {
            this.muxer!.addAudioChunk(chunk, meta);
          }
        },
        error: (error) => {
          console.warn("Failed to write chunk:", error);
        },
      });

      // Configure the audio encoder and check if the config is supported
      const config: AudioEncoderConfig = {
        bitrate: this.mAudioBitrate,
        numberOfChannels: this.audioTrackSettings.channelCount || this.mAudioNumberOfChannels,
        sampleRate: this.audioTrackSettings.sampleRate || this.mAudioSampleRate,
        codec: this.mAudioEncoderCodec,
      };

      const support = await AudioEncoder.isConfigSupported(config);
      console.assert(support.supported, "Audio config not supported:", config);
      this.audioEncoder.configure(config);
    }

    // Draw the stream to canvas and pass the frames to the encoder
    const promises = [this.handleSetupCanvasWriter(), this.handleSetupAudioWriter()];
    Promise.all(promises);
    this.handleEncodeCanvasFrame();
  }

  async handleRecordStream() {
    this.startTime = performance.now();
    this.encodedFrames = 0;
    this.droppedFrames = 0;
    this.lastFrameTime = 0;
    this.recording = true;
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

    assert(this.muxer);
    this.muxer.finalize();
    return this.muxer.target.buffer;
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
