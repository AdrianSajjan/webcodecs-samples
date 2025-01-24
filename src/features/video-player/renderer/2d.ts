import type { Renderer } from "../interfaces/player";

export class Canvas2DRenderer implements Renderer {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, options?: CanvasRenderingContext2DSettings) {
    const context = canvas.getContext("2d", options);
    if (!context) throw new Error("Failed to get 2D context");
    this.canvas = canvas;
    this.ctx = context;
  }

  static createInstance(canvas: HTMLCanvasElement | OffscreenCanvas, options?: CanvasRenderingContext2DSettings) {
    return new Canvas2DRenderer(canvas, options);
  }

  draw(frame: VideoFrame) {
    this.canvas.width = frame.displayWidth;
    this.canvas.height = frame.displayHeight;
    this.ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
    frame.close();
  }
}
