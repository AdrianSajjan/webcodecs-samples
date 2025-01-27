import { MP4VideoMetadata } from "../demuxer";
import { VideoPlayerStatus } from "./player";
import { VideoPlayerEvents } from "../constants/events";

export interface VideoPlayerEventMap {
  [VideoPlayerEvents.VideoEnded]: void;
  [VideoPlayerEvents.TimeUpdated]: number;
  [VideoPlayerEvents.FrameUpdated]: number;
  [VideoPlayerEvents.VideoStatus]: VideoPlayerStatus;
  [VideoPlayerEvents.VideoMetadata]: MP4VideoMetadata;
  [VideoPlayerEvents.VideoConfig]: VideoDecoderConfig;
}

export type VideoPlayerEvent<T extends keyof VideoPlayerEventMap> = CustomEvent<VideoPlayerEventMap[T]>;

export type VideoPlayerEventListener<T extends keyof VideoPlayerEventMap> = (event: VideoPlayerEvent<T>) => void;
