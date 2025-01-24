import { html } from "@/shared/libs/utils";
import { ScreenRecorder } from "@/features/screen-recorder/recorder";

export const Page = html`
  <section id="recorder" class="flex flex-col items-center justify-center h-screen w-screen">
    <div class="flex gap-2">
      <button id="capture" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Capture</button>
      <button id="record" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Record</button>
      <button id="save" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Save</button>
    </div>
    <video id="video" playsinline muted class="mt-10 w-full h-auto max-w-3xl"></video>
  </section>
`;

export function Script() {
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
