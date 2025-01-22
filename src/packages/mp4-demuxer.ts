import MP4Box, { DataStream, MP4ArrayBuffer, MP4File, MP4Info } from "mp4box";

type MP4DemuxerStatus = "idle" | "pending" | "demuxing" | "error" | "complete";

type MP4FileSinkStatus = "idle" | "pending" | "error" | "complete";

interface DemuxerOptions {
  onConfig: (config: VideoDecoderConfig) => void;
  onChunk: (chunk: EncodedVideoChunk) => void;
}

interface VideoDecoderConfig {
  codec: string;
  codedHeight: number;
  codedWidth: number;
  description: Uint8Array;
}

interface EncodedVideoChunk {
  type: "key" | "delta";
  timestamp: number;
  duration: number;
  data: BufferSource;
}

class MP4FileSink {
  status: MP4FileSinkStatus;

  private file: MP4File;
  private offset: number;

  constructor(file: MP4File) {
    this.file = file;
    this.offset = 0;
    this.status = "idle";
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

  constructor(uri: string, options: DemuxerOptions) {
    this.status = "idle";
    this.onConfig = options.onConfig;
    this.onChunk = options.onChunk;

    // Configure an MP4Box File for demuxing
    this.file = MP4Box.createFile();
    this.file.onError = this.onError.bind(this);
    this.file.onReady = this.onReady.bind(this);
    this.file.onSamples = this.onSamples.bind(this);

    // Fetch the file and pipe the data through
    const fileSink = new MP4FileSink(this.file);
    this.fetchFile(uri, fileSink);
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

  private extractDescription(track: any): Uint8Array {
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

    // No container box with the codec data was found
    throw new Error("avcC, hvcC, vpcC, or av1C box not found");
  }

  private onError(error: string) {
    this.status = "error";
    console.error(error);
  }

  private onReady(info: MP4Info) {
    this.status = "demuxing";
    const track = info.videoTracks[0];

    // Generate and emit an appropriate VideoDecoderConfig
    this.onConfig({
      codec: track.codec.startsWith("vp08") ? "vp8" : track.codec,
      description: this.extractDescription(track),
      codedHeight: track.video.height,
      codedWidth: track.video.width,
    });

    // Start demuxing
    this.file.setExtractionOptions(track.id);
    this.file.start();
  }

  private onSamples(_track_id: number, _ref: any, samples: any[]) {
    // Generate and emit an EncodedVideoChunk for each demuxed sample
    for (const sample of samples) {
      this.onChunk({
        type: sample.is_sync ? "key" : "delta",
        timestamp: (1e6 * sample.cts) / sample.timescale,
        duration: (1e6 * sample.duration) / sample.timescale,
        data: sample.data,
      });
    }
  }
}
