import { MP4Player } from "@/features/video-player/player";

window.addEventListener("load", handleSetupMP4Player);

function handleSetupMP4Player() {
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
