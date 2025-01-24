import { MP4Player } from "@/features/video-player/player";
import { html } from "@/shared/libs/utils";

export const Page = html`
  <section id="player" class="flex flex-col items-center justify-center h-screen w-screen">
    <div class="flex gap-2">
      <input type="file" id="file" hidden />
      <button id="upload-video" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Upload MP4 Video</button>
    </div>
    <div class="flex gap-2 mt-4">
      <select id="speed" class="bg-neutral-800 text-white px-2 py-1 rounded-md">
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="4">4</option>
        <option value="8">8</option>
        <option value="0.75">0.75</option>
        <option value="0.5">0.5</option>
        <option value="0.25">0.25</option>
      </select>
      <button id="play" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Play</button>
      <button id="play-reverse" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Reverse</button>
      <button id="pause" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Pause</button>
    </div>
    <div class="flex gap-2 mt-4">
      <input type="number" id="seek-frame-input" class="bg-neutral-800 text-white px-2 py-1 rounded-md" />
      <button id="seek-frame-button" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Seek Frame</button>
      <button id="seek-time-button" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Seek Time</button>
    </div>
    <div id="mp4-player" class="w-full h-auto max-w-[30rem] mt-10"></div>
  </section>
`;

export function Script() {
  const fileInput = document.getElementById("file") as HTMLInputElement;
  const uploadVideoButton = document.getElementById("upload-video") as HTMLButtonElement;
  const container = document.getElementById("mp4-player") as HTMLDivElement;
  const playButton = document.getElementById("play") as HTMLButtonElement;
  const pauseButton = document.getElementById("pause") as HTMLButtonElement;
  const speedSelect = document.getElementById("speed") as HTMLSelectElement;
  const seekFrameInput = document.getElementById("seek-frame-input") as HTMLInputElement;
  const seekTimeButton = document.getElementById("seek-time-button") as HTMLButtonElement;
  const playReverseButton = document.getElementById("play-reverse") as HTMLButtonElement;
  const seekFrameButton = document.getElementById("seek-frame-button") as HTMLButtonElement;

  let url = "/videos/sample.mp4";
  let mp4Player = MP4Player.createInstance(url, container);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.item(0);
    if (file) {
      if (url && url !== "/videos/sample.mp4") URL.revokeObjectURL(url);
      url = URL.createObjectURL(file);

      if (mp4Player) mp4Player.destroy();
      mp4Player = MP4Player.createInstance(url, container);
    }
  });

  uploadVideoButton.addEventListener("click", () => fileInput.click());

  playButton.addEventListener("click", () => mp4Player.play());

  pauseButton.addEventListener("click", () => mp4Player.pause());

  playReverseButton.addEventListener("click", () => mp4Player.reverse());

  speedSelect.addEventListener("change", () => mp4Player.speed(Number(speedSelect.value)));

  seekFrameButton.addEventListener("click", () => mp4Player.seek("frame", Number(seekFrameInput.value)));

  seekTimeButton.addEventListener("click", () => mp4Player.seek("time", Number(seekFrameInput.value)));
}
