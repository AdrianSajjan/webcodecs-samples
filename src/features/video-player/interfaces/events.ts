import { VideoPlayerStatus } from "./player";
import { VideoPlayerEvents } from "../constants/events";
import { MP4AudioMetadata, MP4VideoMetadata } from "../demuxer";

export interface VideoPlayerEventMap {
  [VideoPlayerEvents.VideoEnded]: void;
  [VideoPlayerEvents.AudioBuffer]: void;
  [VideoPlayerEvents.TimeUpdated]: number;
  [VideoPlayerEvents.FrameUpdated]: number;
  [VideoPlayerEvents.VideoStatus]: VideoPlayerStatus;
  [VideoPlayerEvents.VideoMetadata]: MP4VideoMetadata;
  [VideoPlayerEvents.VideoConfig]: VideoDecoderConfig;
  [VideoPlayerEvents.AudioMetadata]: MP4AudioMetadata;
  [VideoPlayerEvents.AudioConfig]: AudioDecoderConfig;
}

export type VideoPlayerEvent<T extends keyof VideoPlayerEventMap> = CustomEvent<VideoPlayerEventMap[T]>;

export type VideoPlayerEventListener<T extends keyof VideoPlayerEventMap> = (event: VideoPlayerEvent<T>) => void;
