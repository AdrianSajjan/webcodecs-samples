export interface Renderer {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;

  draw(frame: VideoFrame): void;
}
