export function assert<T>(value?: T | null): asserts value is T {
  if (!value) throw new Error("Recorder is not initialized");
}
