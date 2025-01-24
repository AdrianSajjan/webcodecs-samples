import { MP4Player } from "../video-player/player";

export class VideoCropper {
  private readonly player: MP4Player;
  private readonly canvas: HTMLCanvasElement;

  top: number;
  left: number;

  width: number;
  height: number;

  constructor(video: string) {
    this.top = 0;
    this.left = 0;

    this.width = 0;
    this.height = 0;

    this.player = MP4Player.createInstance(video);
    this.canvas = document.createElement("canvas");
  }

  static createInstance(video: string) {
    return new VideoCropper(video);
  }

  crop(top: number, left: number, width: number, height: number) {
    this.top = top;
    this.left = left;
    this.width = width;
    this.height = height;
  }
}
