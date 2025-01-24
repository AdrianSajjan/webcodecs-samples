import { html } from "@/shared/libs/utils";

export const Page = html`
  <section id="watermark" class="flex flex-col items-center justify-center h-screen w-screen">
    <div class="flex gap-2">
      <input type="file" id="video-file" hidden />
      <button id="upload-video" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Upload MP4 Video</button>
    </div>
    <div class="flex gap-2 mt-4">
      <input type="file" id="watermark-file" hidden />
      <button id="upload-watermark" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Upload Watermark</button>
    </div>
    <div class="flex gap-2 mt-4">
      <button id="add-watermark" class="bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer">Process Video</button>
    </div>
    <div id="container" class="mt-4"></div>
  </section>
`;

export function Script() {
  const videoFileInput = document.getElementById("video-file") as HTMLInputElement;
  const watermarkFileInput = document.getElementById("watermark-file") as HTMLInputElement;

  const uploadVideoButton = document.getElementById("upload-video") as HTMLButtonElement;
  const uploadWatermarkButton = document.getElementById("upload-watermark") as HTMLButtonElement;

  let videoUrl: string | null = null;
  let watermarkUrl: string | null = null;

  uploadVideoButton.addEventListener("click", () => videoFileInput.click());
  uploadWatermarkButton.addEventListener("click", () => watermarkFileInput.click());

  videoFileInput.addEventListener("change", (event: any) => {
    const file = event.target.files[0];
    videoUrl = URL.createObjectURL(file);
  });

  watermarkFileInput.addEventListener("change", (event: any) => {
    const file = event.target.files[0];
    watermarkUrl = URL.createObjectURL(file);
  });
}
