import { html } from "@/shared/libs/utils";

export const Page = html`
  <section id="home" class="flex flex-col items-center justify-center h-screen w-screen">
    <div class="text-center">
      <h1 class="text-2xl font-bold">WebCodecs Examples</h1>
      <p class="text-sm text-gray-400 mt-1">Simple implementations of video processing using the WebCodecs API:</p>
      <ul class="list-disc list-inside mt-4">
        <li><strong>MP4 Player</strong>: Efficient video playback with frame-accurate seeking and WebGL rendering</li>
        <li><strong>Screen Recorder</strong>: High-performance screen capture with real-time encoding and MP4 muxing</li>
      </ul>
    </div>
    <div class="flex gap-4 mt-8">
      <a href="/player" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer" data-link>Player</a>
      <a href="/recorder" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer" data-link>Recorder</a>
      <a href="/watermark" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer" data-link>Watermark</a>
    </div>
  </section>
`;

export function Script() {
  console.log("Home");
}
