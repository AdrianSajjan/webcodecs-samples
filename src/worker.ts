import type { RuntimeMessage } from "@/types/events";

async function setupWorker() {
  const { RuntimeEvents } = await import("@/types/events");

  self.addEventListener("message", (event: MessageEvent<RuntimeMessage>) => {
    switch (event.data.type) {
      case RuntimeEvents.SetupWorker:
        self.postMessage({ type: RuntimeEvents.SetupWorkerSuccess });
        break;

      case RuntimeEvents.StartCapture:
        break;

      case RuntimeEvents.SaveCapture:
        break;
    }
  });
}

setupWorker();
