import { ScreenRecorder } from "@/scripts/screen-recorder";
import { MP4Player } from "@/packages/mp4-player";

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

function handleSetupScreenRecorder() {
  if (!window.VideoEncoder || !window.VideoEncoder) {
    return alert("Your browser does not support webcodecs API yet.");
  }

  const video = document.getElementById("video") as HTMLVideoElement;
  const recorder = ScreenRecorder.createInstance(video);

  const saveButton = document.getElementById("save") as HTMLButtonElement;
  const captureButton = document.getElementById("capture") as HTMLButtonElement;
  const recordButton = document.getElementById("record") as HTMLButtonElement;

  saveButton.addEventListener("click", async () => {
    try {
      saveButton.disabled = true;
      saveButton.textContent = "Saving...";
      await recorder.handleSaveStream();
    } catch (error) {
      alert(JSON.stringify(error));
    } finally {
      saveButton.disabled = false;
      recordButton.disabled = false;
      captureButton.disabled = false;

      saveButton.textContent = "Save";
      recordButton.textContent = "Record";
      captureButton.textContent = "Capture";
    }
  });

  captureButton.addEventListener("click", async () => {
    try {
      captureButton.disabled = true;
      await recorder.handleCaptureStream();
      captureButton.textContent = "Capturing...";
    } catch (error) {
      alert(JSON.stringify(error));
      captureButton.disabled = false;
      captureButton.textContent = "Capture";
    }
  });

  recordButton.addEventListener("click", async () => {
    try {
      recordButton.disabled = true;
      await recorder.handleRecordStream();
      recordButton.textContent = "Recording...";
    } catch (error) {
      alert(JSON.stringify(error));
      recordButton.disabled = false;
      recordButton.textContent = "Record";
    }
  });
}
