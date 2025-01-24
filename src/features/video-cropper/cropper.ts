import { MP4Player } from "../video-player/player";

interface Position {
  top: number;
  left: number;
}

interface Dimension {
  width: number;
  height: number;
}

export class VideoCropper {
  private player: MP4Player;
  private canvas: HTMLCanvasElement;

  position: Position;
  dimension: Dimension;

  constructor(video: string) {
    this.position = { top: 0, left: 0 };
    this.dimension = { width: 0, height: 0 };
    this.player = MP4Player.createInstance(video);
    this.canvas = document.createElement("canvas");
  }

  static createInstance(video: string) {
    return new VideoCropper(video);
  }

  async process() {
    await this.player.initialize();
  }
}
