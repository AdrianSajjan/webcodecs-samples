import MP4Box, { DataStream, MP4ArrayBuffer, MP4File, MP4Info, Sample } from "mp4box";

type MP4DemuxerStatus = "idle" | "pending" | "demuxing" | "error" | "complete";

type MP4FileSinkStatus = "idle" | "pending" | "error" | "complete";

export interface DemuxerOptions {
  onConfig: (config: VideoDecoderConfig) => void;
  onChunk: (chunk: EncodedVideoChunk) => void;
  onMetadata: (metadata: MP4FileMetadata) => void;
}

export interface MP4FileMetadata {
  fps: number;
  duration: number;
  frames: number;
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

  private onChunk: (chunk: EncodedVideoChunk) => void;
  private onConfig: (config: VideoDecoderConfig) => void;
  private onMetadata: (metadata: MP4FileMetadata) => void;

  constructor(uri: string, options: DemuxerOptions) {
    this.status = "idle";
    this.onConfig = options.onConfig;
    this.onChunk = options.onChunk;
    this.onMetadata = options.onMetadata;

    // Configure an MP4Box File for demuxing
    this.file = MP4Box.createFile();
    this.file.onError = this.onError.bind(this);
    this.file.onReady = this.onReady.bind(this);
    this.file.onSamples = this.onSamples.bind(this);

    // Fetch the file and pipe the data through
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
      // Response must have a body
      if (!response.body) throw new Error("No response body");

      // Create a WritableStream to pipe the response body to the file sink
      const reader = response.body.getReader();
      const stream = new WritableStream(fileSink, { highWaterMark: 2 });
      const writer = stream.getWriter();

      // Read the response body and pipe it to the file sink
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
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
    if (!trak) throw new Error("Track not found");

    // @ts-ignore
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8); // Remove the box header
      }
    }

    throw new Error("avcC, hvcC, vpcC, or av1C box not found");
  }

  private onError(error: string) {
    this.status = "error";
    console.warn(error);
  }

  private onReady(info: MP4Info) {
    this.status = "demuxing";

    const track = info.videoTracks[0];
    const duration = info.duration / info.timescale;

    this.onConfig({
      codedWidth: track.video.width,
      codedHeight: track.video.height,
      description: this.extractDescription(track),
      codec: track.codec.startsWith("vp08") ? "vp8" : track.codec,
    });

    this.onMetadata({
      fps: Math.round(track.nb_samples / duration),
      duration: duration,
      frames: track.nb_samples,
    });

    this.file.setExtractionOptions(track.id);
    this.file.start();
  }

  private onSamples(_track_id: number, _user: any, samples: Sample[]) {
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];

      const type = sample.is_sync ? "key" : "delta";
      const timestamp = (1e6 * sample.cts) / sample.timescale;
      const duration = (1e6 * sample.duration) / sample.timescale;
      const data = sample.data;

      const chunk = new EncodedVideoChunk({ data, type, timestamp, duration });
      this.onChunk(chunk);
    }
  }
}
