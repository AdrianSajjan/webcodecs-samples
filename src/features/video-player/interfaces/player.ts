export type VideoPlayerStatus = "idle" | "pending" | "ready" | "error";

export type VideoPlayerPlaybackState = "playing" | "paused" | "ended";

export interface VideoPlayerInitializeOptions {
  fluid?: boolean;
}
