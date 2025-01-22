import * as MuxerMP4 from "mp4-muxer";
import { BaseRecorder } from "@/packages/base-recorder";

export class MP4Recorder extends BaseRecorder<MuxerMP4.Muxer<MuxerMP4.ArrayBufferTarget>> {
  protected override readonly mAudioEncoderCodec = "mp4a.40.2";
  protected override readonly mVideoEncoderCodec = "avc1.64002A";

  protected override readonly mVideoMuxerCodec = "avc";
  protected override readonly mAudioMuxerCodec = "aac";

  constructor(clone: boolean) {
    super(clone);
    console.log("MP4Recorder is initialized");
  }

  static createInstance(clone: boolean) {
    return new MP4Recorder(clone);
  }

  protected override handleSetupMuxer() {
    this.muxer = new MuxerMP4.Muxer({
      target: new MuxerMP4.ArrayBufferTarget(),
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
      video: {
        codec: this.mVideoMuxerCodec,
        width: this.canvas.width,
        height: this.canvas.height,
        frameRate: this.targetFPS,
      },
      audio: this.audioTrackSettings
        ? {
            codec: this.mAudioMuxerCodec,
            sampleRate: this.audioTrackSettings.sampleRate || this.mAudioSampleRate,
            numberOfChannels: this.audioTrackSettings.channelCount || this.mAudioNumberOfChannels,
          }
        : undefined,
    });
  }
}
