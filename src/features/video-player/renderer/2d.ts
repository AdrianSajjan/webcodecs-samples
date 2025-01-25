import type { Renderer } from "../interfaces/renderer";

export class Canvas2DRenderer implements Renderer {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;

  constructor(canvas: OffscreenCanvas, options?: CanvasRenderingContext2DSettings) {
    const context = canvas.getContext("2d", options);
    if (!context) throw new Error("Failed to get 2D context");
    this.canvas = canvas;
    this.context = context;
  }

  static createInstance(canvas: OffscreenCanvas, options?: CanvasRenderingContext2DSettings) {
    return new Canvas2DRenderer(canvas, options);
  }

  draw(frame: VideoFrame) {
    this.canvas.width = frame.displayWidth;
    this.canvas.height = frame.displayHeight;
    this.context.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
    frame.close();
  }
}
