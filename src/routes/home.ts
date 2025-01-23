import { html } from "@/shared/libs/utils";

export const Page = html`
  <section id="home">
    <div>
      <h1>WebCodecs Examples</h1>
      <p>Simple implementations of video processing using the WebCodecs API:</p>
      <ul>
        <li><strong>MP4 Player</strong>: Efficient video playback with frame-accurate seeking and WebGL rendering</li>
        <li><strong>Screen Recorder</strong>: High-performance screen capture with real-time encoding and MP4 muxing</li>
      </ul>
    </div>
    <div>
      <a href="/player" data-link>Player</a>
      <a href="/recorder" data-link>Recorder</a>
    </div>
  </section>
`;

export function Script() {
  console.log("Home");
}
