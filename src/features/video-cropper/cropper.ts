import * as MP4Muxer from "mp4-muxer";
import { MP4Player } from "../video-player/player";
import { wait } from "../../shared/libs/utils";

interface Position {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface Dimension {
  width: number;
  height: number;
}

export class VideoCropper {
  private player: MP4Player;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  private position: Position;
  private dimension: Dimension;

  constructor(video: string) {
    this.position = { top: 0, left: 0, right: 0, bottom: 0 };
    this.dimension = { width: 0, height: 0 };

    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d")!;

    this.player = MP4Player.createInstance(video);
  }

  static createInstance(video: string) {
    return new VideoCropper(video);
  }

  private async handleInitializePlayer() {
    if (this.player.status === "error") throw new Error("Player is in error state");
    if (this.player.status !== "ready") await this.player.initialize();
  }

  async initialize(position: Position) {
    await this.handleInitializePlayer();

    this.position.top = this.player.originalHeight * (position.top / 100);
    this.position.left = this.player.originalWidth * (position.left / 100);

    this.position.right = this.player.originalWidth - this.player.originalWidth * (position.right / 100);
    this.position.bottom = this.player.originalHeight - this.player.originalHeight * (position.bottom / 100);

    this.dimension.width = Math.round(this.position.right - this.position.left);
    this.dimension.height = Math.round(this.position.bottom - this.position.top);

    if (this.dimension.width % 2 !== 0) this.dimension.width -= 1;
    if (this.dimension.height % 2 !== 0) this.dimension.height -= 1;

    this.canvas.width = this.dimension.width;
    this.canvas.height = this.dimension.height;
  }

  async process() {
    await this.handleInitializePlayer();

    const top = this.position.top;
    const left = this.position.left;

    const fps = this.player.videoMetadata?.fps || 30;
    const codec = this.player.videoConfig?.codec || "avc1.64002A";

    const width = this.dimension.width % 2 === 0 ? this.dimension.width : this.dimension.width - 1;
    const height = this.dimension.height % 2 === 0 ? this.dimension.height : this.dimension.height - 1;

    const muxer = new MP4Muxer.Muxer({
      target: new MP4Muxer.ArrayBufferTarget(),
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
      video: { codec: "avc", width, height, frameRate: fps },
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        muxer.addVideoChunk(chunk, meta);
      },
      error: (error) => {
        console.warn("Failed to write chunk:", error);
      },
    });

    const config: VideoEncoderConfig = { width, height, framerate: fps, codec };
    const support = await VideoEncoder.isConfigSupported(config);
    console.assert(support.supported, "Video config not supported:", config);
    videoEncoder.configure(config);

    while (true) {
      if (this.player.currentFrame >= this.player.videoMetadata!.frames) break;

      const keyframe = this.player.currentFrame % (fps * 2) === 0;
      const timestamp = (this.player.currentFrame * 1e6) / fps;
      const frame = new VideoFrame(this.canvas, { timestamp, duration: 1e6 / fps, alpha: "discard" });

      try {
        const bitmap = await this.player.next();
        this.context.drawImage(bitmap, left, top, width, height, 0, 0, width, height);
        bitmap.close();

        while (true) {
          if (videoEncoder.encodeQueueSize <= 10) break;
          console.log("Encoder queue is full, waiting...");
          await wait(100);
        }

        videoEncoder.encode(frame, { keyFrame: keyframe });
      } catch (error) {
        console.warn(error);
        break;
      }

      frame.close();
    }

    await videoEncoder.flush();
    videoEncoder.close();
    muxer.finalize();

    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  }

  destroy() {
    this.player.destroy();
  }
}
