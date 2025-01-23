import type { Renderer } from "../interfaces/player";

export class Canvas2DRenderer implements Renderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Failed to get 2D context");
    this.canvas = canvas;
    this.ctx = context;
  }

  static createInstance(canvas: HTMLCanvasElement | OffscreenCanvas) {
    return new Canvas2DRenderer(canvas);
  }

  draw(frame: VideoFrame) {
    this.canvas.width = frame.displayWidth;
    this.canvas.height = frame.displayHeight;
    this.ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
    frame.close();
  }
}
