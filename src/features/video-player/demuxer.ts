import MP4Box, { DataStream, MP4ArrayBuffer, MP4AudioTrack, MP4File, MP4Info, MP4VideoTrack, Sample } from "mp4box";

type MP4DemuxerStatus = "idle" | "pending" | "demuxing" | "error" | "complete";

type MP4FileSinkStatus = "idle" | "pending" | "error" | "complete";

export interface DemuxerOptions {
  onVideoConfig: (config: VideoDecoderConfig) => void;
  onVideoChunk: (chunk: EncodedVideoChunk) => void;
  onVideoMetadata: (metadata: MP4VideoMetadata) => void;

  onAudioConfig?: (config: AudioDecoderConfig) => void;
  onAudioMetadata?: (metadata: MP4AudioMetadata) => void;
  onAudioChunk?: (chunk: EncodedAudioChunk) => void;
}

export interface MP4VideoMetadata {
  fps: number;
  duration: number;
  frames: number;
}

export interface MP4AudioMetadata {
  codec: string;
  bitrate: number;
  samples: number;
  volume: number;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
}

class MP4FileSink {
  file: MP4File;
  offset: number;
  status: MP4FileSinkStatus;

  constructor(file: MP4File) {
    this.file = file;
    this.offset = 0;
    this.status = "idle";
  }

  static createInstance(file: MP4File) {
    return new MP4FileSink(file);
  }

  write(chunk: Uint8Array) {
    // MP4Box.js requires buffers to be ArrayBuffers, but we have a Uint8Array
    const buffer = new ArrayBuffer(chunk.byteLength) as MP4ArrayBuffer;
    new Uint8Array(buffer).set(chunk);

    // Inform MP4Box where in the file this chunk is from
    buffer.fileStart = this.offset;
    this.offset += buffer.byteLength;

    // Start the file sink
    this.status = "pending";
    this.file.appendBuffer(buffer);
  }

  close() {
    this.status = "complete";
    this.file.flush();
  }
}

export class MP4Demuxer {
  file: MP4File;
  status: MP4DemuxerStatus;

  videoDuration?: number;
  audioDuration?: number;

  videoTrack?: MP4VideoTrack;
  audioTrack?: MP4AudioTrack;

  private onVideoChunk: (chunk: EncodedVideoChunk) => void;
  private onVideoConfig: (config: VideoDecoderConfig) => void;
  private onVideoMetadata: (metadata: MP4VideoMetadata) => void;

  private onAudioChunk?: (chunk: EncodedAudioChunk) => void;
  private onAudioConfig?: (config: AudioDecoderConfig) => void;
  private onAudioMetadata?: (metadata: MP4AudioMetadata) => void;

  constructor(uri: string, options: DemuxerOptions) {
    this.status = "idle";

    this.onVideoConfig = options.onVideoConfig;
    this.onVideoChunk = options.onVideoChunk;
    this.onVideoMetadata = options.onVideoMetadata;

    this.onAudioConfig = options.onAudioConfig;
    this.onAudioChunk = options.onAudioChunk;
    this.onAudioMetadata = options.onAudioMetadata;

    this.file = MP4Box.createFile();
    this.file.onError = this.onError.bind(this);
    this.file.onReady = this.onReady.bind(this);
    this.file.onSamples = this.onSamples.bind(this);

    const fileSink = MP4FileSink.createInstance(this.file);
    this.fetchFile(uri, fileSink);
  }

  static createInstance(uri: string, options: DemuxerOptions) {
    return new MP4Demuxer(uri, options);
  }

  private async fetchFile(uri: string, fileSink: MP4FileSink) {
    this.status = "pending";
    try {
      const response = await fetch(uri);
      if (!response.body) throw new Error("Response body is null");

      const reader = response.body.getReader();
      const stream = new WritableStream(fileSink, { highWaterMark: 2 });
      const writer = stream.getWriter();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error during fetch";
        this.onError(message);
      } finally {
        await writer.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error during fetch";
      this.onError(message);
    }
  }

  private extractDescription(track: MP4Box.MP4Track): Uint8Array {
    const trak = this.file.getTrackById(track.id);
    if (!trak) throw new Error("Video track not found");
    // @ts-ignore
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8); // Remove the box header
      }
    }
    // No video codec found
    throw new Error("avcC, hvcC, vpcC, or av1C box not found");
  }

  private extractAudioConfiguration(track: MP4Box.MP4Track) {
    const trak = this.file.getTrackById(track.id);
    if (!trak) throw new Error("Audio track not found");
    // @ts-ignore
    console.assert(trak.mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].tag == 0x04);
    // @ts-ignore
    console.assert(trak.mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].oti == 0x40);
    // @ts-ignore
    console.assert(trak.mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].descs[0].tag == 0x05);
    // @ts-ignore
    return trak.mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].descs[0].data;
  }

  private onError(error: string) {
    this.status = "error";
    console.warn(error);
  }

  private onReady(info: MP4Info) {
    this.status = "demuxing";

    this.videoTrack = info.videoTracks[0];
    this.audioTrack = info.audioTracks[0];

    if (this.videoTrack) {
      this.videoDuration = this.videoTrack.duration / this.videoTrack.timescale;

      this.onVideoConfig({
        codedWidth: this.videoTrack.video.width,
        codedHeight: this.videoTrack.video.height,
        description: this.extractDescription(this.videoTrack),
        codec: this.videoTrack.codec.startsWith("vp08") ? "vp8" : this.videoTrack.codec,
      });

      this.onVideoMetadata({
        fps: Math.round(this.videoTrack.nb_samples / this.videoDuration),
        duration: this.videoDuration,
        frames: this.videoTrack.nb_samples,
      });

      this.file.setExtractionOptions(this.videoTrack.id);
    }

    if (this.audioTrack) {
      this.audioDuration = this.audioTrack.duration / this.audioTrack.timescale;

      this.onAudioConfig?.({
        sampleRate: this.audioTrack.audio.sample_rate,
        codec: this.audioTrack.codec,
        numberOfChannels: this.audioTrack.audio.channel_count,
        description: this.extractAudioConfiguration(this.audioTrack),
      });

      this.onAudioMetadata?.({
        codec: this.audioTrack.codec,
        samples: this.audioTrack.nb_samples,
        bitrate: this.audioTrack.bitrate,
        volume: this.audioTrack.volume,
        duration: this.audioDuration,
        sampleRate: this.audioTrack.audio.sample_rate,
        numberOfChannels: this.audioTrack.audio.channel_count,
      });

      this.file.setExtractionOptions(this.audioTrack.id, null);
    }

    this.file.start();
  }

  private onSamples(track_id: number, _user: any, samples: Sample[]) {
    if (track_id === this.videoTrack?.id) {
      for (let index = 0; index < samples.length; index++) {
        const sample = samples[index];

        const type = sample.is_sync ? "key" : "delta";
        const timestamp = (1e6 * sample.cts) / sample.timescale;
        const duration = (1e6 * sample.duration) / sample.timescale;
        const data = sample.data;

        const chunk = new EncodedVideoChunk({ data, type, timestamp, duration });
        this.onVideoChunk(chunk);
      }
    }

    if (track_id === this.audioTrack?.id) {
      for (let index = 0; index < samples.length; index++) {
        const sample = samples[index];

        const timestamp = (1e6 * sample.cts) / sample.timescale;
        const duration = (1e6 * sample.duration) / sample.timescale;
        const data = sample.data;

        const chunk = new EncodedAudioChunk({ type: "key", timestamp, duration, data });
        this.onAudioChunk?.(chunk);
      }
    }
  }
}
