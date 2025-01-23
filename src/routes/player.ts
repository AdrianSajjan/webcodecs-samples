import { MP4Player } from "@/features/video-player/player";
import { html } from "@/shared/libs/utils";

export const Page = html`
  <section id="player">
    <div class="player-controls">
      <select id="speed">
        <option value="0.25">0.25</option>
        <option value="0.5">0.5</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="4">4</option>
      </select>
      <button id="play">Play</button>
      <button id="pause">Pause</button>
    </div>
    <div class="player-seek">
      <input type="number" id="seek-frame-input" />
      <button id="seek-frame-button">Seek Frame</button>
    </div>
    <div id="mp4-player" class="mp4-player"></div>
  </section>
`;

export function Script() {
  const container = document.getElementById("mp4-player") as HTMLDivElement;
  const mp4Player = MP4Player.createInstance(container, "http://localhost:5173/videos/sample.mp4");

  const playButton = document.getElementById("play") as HTMLButtonElement;
  playButton.addEventListener("click", () => mp4Player.play());

  const pauseButton = document.getElementById("pause") as HTMLButtonElement;
  pauseButton.addEventListener("click", () => mp4Player.pause());

  const speedSelect = document.getElementById("speed") as HTMLSelectElement;
  speedSelect.addEventListener("change", (event: any) => mp4Player.setPlaybackSpeed(Number(event.target.value)));

  const seekFrameInput = document.getElementById("seek-frame-input") as HTMLInputElement;
  const seekFrameButton = document.getElementById("seek-frame-button") as HTMLButtonElement;
  seekFrameButton.addEventListener("click", () => mp4Player.seek("frame", Number(seekFrameInput.value)));
}
