import { html } from "@/shared/libs/utils";
import { VideoCropper } from "@/features/video-cropper/cropper";

export const Page = html`
  <section id="crop" class="flex flex-col items-center justify-center h-screen w-screen">
    <div class="flex gap-2">
      <input type="file" id="video-file" hidden />
      <button id="upload-video" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Upload Video</button>
      <button id="process-video" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Process Video</button>
    </div>
    <div class="flex gap-4 mt-4">
      <div class="flex flex-col gap-2">
        <label for="left">Left</label>
        <input type="range" id="left" min="0" max="100" step="0.1" value="0" />
      </div>
      <div class="flex flex-col gap-2">
        <label for="top">Top</label>
        <input type="range" id="top" min="0" max="100" step="0.1" value="0" />
      </div>
      <div class="flex flex-col gap-2">
        <label for="right">Right</label>
        <input type="range" id="right" min="0" max="100" step="0.1" value="0" />
      </div>
      <div class="flex flex-col gap-2">
        <label for="bottom">Bottom</label>
        <input type="range" id="bottom" min="0" max="100" step="0.1" value="0" />
      </div>
    </div>
    <div id="container" class="mt-10">
      <div id="video-wrapper" class="relative">
        <video id="video" class="w-full h-auto max-w-xl" controls></video>
        <div id="cropper" class="absolute inset-0 bg-black/60 pointer-events-none border-2 border-white/20">
          <div class="absolute h-3 w-3 bg-blue-600 rounded-full top-0 left-0 -translate-x-1/2 -translate-y-1/2"></div>
          <div class="absolute h-3 w-3 bg-blue-600 rounded-full top-0 right-0 translate-x-1/2 -translate-y-1/2"></div>
          <div class="absolute h-3 w-3 bg-blue-600 rounded-full bottom-0 left-0 -translate-x-1/2 translate-y-1/2"></div>
          <div class="absolute h-3 w-3 bg-blue-600 rounded-full bottom-0 right-0 translate-x-1/2 translate-y-1/2"></div>
        </div>
      </div>
    </div>
  </section>
`;

export function Script() {
  let url: string = "/videos/sample.mp4";

  let left: number = 0;
  let top: number = 0;
  let right: number = 0;
  let bottom: number = 0;

  const videoFileInput = document.getElementById("video-file") as HTMLInputElement;
  const uploadVideoButton = document.getElementById("upload-video") as HTMLButtonElement;

  const cropper = document.getElementById("cropper") as HTMLDivElement;
  const leftInput = document.getElementById("left") as HTMLInputElement;
  const topInput = document.getElementById("top") as HTMLInputElement;
  const rightInput = document.getElementById("right") as HTMLInputElement;
  const bottomInput = document.getElementById("bottom") as HTMLInputElement;

  leftInput.addEventListener("input", () => {
    left = parseInt(leftInput.value);
    cropper.style.left = `${left}%`;
  });

  topInput.addEventListener("input", () => {
    top = parseInt(topInput.value);
    cropper.style.top = `${top}%`;
  });

  rightInput.addEventListener("input", () => {
    right = parseInt(rightInput.value);
    cropper.style.right = `${right}%`;
  });

  bottomInput.addEventListener("input", () => {
    bottom = parseInt(bottomInput.value);
    cropper.style.bottom = `${bottom}%`;
  });

  uploadVideoButton.addEventListener("click", () => videoFileInput.click());

  const video = document.getElementById("video") as HTMLVideoElement;
  video.src = url;

  const processButton = document.getElementById("process-video") as HTMLButtonElement;

  videoFileInput.addEventListener("change", (event: any) => {
    const file = event.target.files[0];
    if (file) {
      if (url !== "/videos/sample.mp4") URL.revokeObjectURL(url);
      url = URL.createObjectURL(file);
      video.src = url;
    }
  });

  processButton.addEventListener("click", async () => {
    const cropper = VideoCropper.createInstance(url);
    processButton.disabled = true;
    processButton.textContent = "Processing...";

    try {
      await cropper.initialize({ top, left, right, bottom });
      const blob = await cropper.process();
      if (url !== "/videos/sample.mp4") URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      video.src = url;
    } catch (error) {
      console.error(error);
    } finally {
      cropper.destroy();
      processButton.disabled = false;
      processButton.textContent = "Process Video";
    }
  });
}
