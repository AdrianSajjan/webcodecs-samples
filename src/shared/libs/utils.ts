export function assert<T>(value?: T | null): asserts value is T {
  if (!value) throw new Error("Recorder is not initialized");
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function html(template: TemplateStringsArray): string {
  return template.raw.join("");
}

interface WaitUnitWorkerEventOptions<P = any, E = any, SE = string, EE = string> {
  success: SE;
  error?: EE;
  onSuccess?: (payload: P) => void;
  onError?: (error: E) => void;
}

export function waitUnitWorkerEvent<P = any, E = any, SE = string, EE = string>(
  worker: Worker,
  { success, error, onSuccess, onError }: WaitUnitWorkerEventOptions<P, E, SE, EE>
) {
  return new Promise<P>((resolve, reject) => {
    worker.addEventListener(
      "message",
      (event) => {
        if (event.data.type === success) {
          onSuccess?.(event.data.payload);
          resolve(event.data.payload);
        }
        if (event.data.type === error) {
          onError?.(event.data.payload);
          reject(event.data.payload);
        }
      },
      {
        once: true,
      }
    );
  });
}
