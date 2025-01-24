import { MP4FileMetadata } from "../demuxer";
import { VideoPlayerStatus } from "./player";
import { VideoPlayerEvents } from "../constants/events";

export interface VideoPlayerEventMap {
  [VideoPlayerEvents.VideoEnded]: CustomEvent;
  [VideoPlayerEvents.SetupWorkerSuccess]: CustomEvent;
  [VideoPlayerEvents.TimeUpdated]: CustomEvent<number>;
  [VideoPlayerEvents.FrameUpdated]: CustomEvent<number>;
  [VideoPlayerEvents.VideoStatus]: CustomEvent<VideoPlayerStatus>;
  [VideoPlayerEvents.VideoMetadata]: CustomEvent<MP4FileMetadata>;
  [VideoPlayerEvents.VideoConfig]: CustomEvent<VideoDecoderConfig>;
}
