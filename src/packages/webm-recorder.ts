import * as MuxerWebM from "webm-muxer";
import { BaseRecorder, BaseRecorderInit } from "@/packages/base-recorder";

export class WebMRecorder extends BaseRecorder<MuxerWebM.Muxer<MuxerWebM.ArrayBufferTarget>> {
  protected override readonly mAudioEncoderCodec = "opus";
  protected override readonly mVideoEncoderCodec = "vp09.00.10.08";

  protected override readonly mVideoMuxerCodec = "V_VP9";
  protected override readonly mAudioMuxerCodec = "A_OPUS";

  constructor(props?: BaseRecorderInit) {
    super(props);
    console.log("WebM Recorder is initialized");
  }

  static createInstance(props?: BaseRecorderInit) {
    return new WebMRecorder(props);
  }

  protected override handleSetupMuxer() {
    this.muxer = new MuxerWebM.Muxer({
      target: new MuxerWebM.ArrayBufferTarget(),
      type: "webm",
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
