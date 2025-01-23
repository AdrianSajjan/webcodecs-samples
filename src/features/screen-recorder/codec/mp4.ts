import * as MuxerMP4 from "mp4-muxer";
import { BaseRecorder, BaseRecorderInit } from "./base";

export class MP4Recorder extends BaseRecorder<MuxerMP4.Muxer<MuxerMP4.ArrayBufferTarget>> {
  protected override readonly mAudioEncoderCodec = "mp4a.40.2";
  protected override readonly mVideoEncoderCodec = "avc1.64002A";

  protected override readonly mVideoMuxerCodec = "avc";
  protected override readonly mAudioMuxerCodec = "aac";

  constructor(props?: BaseRecorderInit) {
    super(props);
    console.log("MP4Recorder is initialized");
  }

  static createInstance(props?: BaseRecorderInit) {
    return new MP4Recorder(props);
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
