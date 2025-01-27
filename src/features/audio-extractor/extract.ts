interface AudioChunkExtractorOptions {
  mimeType: string;
  audioBitsPerSecond?: number;
  onChunk: (chunk: EncodedAudioChunk, timestamp: number) => void;
}

export class AudioChunkExtractor {
  status: "idle" | "pending" | "ready" | "error" = "idle";

  private context!: AudioContext;
  private element!: HTMLVideoElement;
  private resolver!: PromiseWithResolvers<void>;

  private source!: MediaElementAudioSourceNode;
  private recorder!: MediaRecorder;
  private destination!: MediaStreamAudioDestinationNode;

  private readonly mAudioBitsPerSeoncd = 128000;

  constructor(private readonly file: File, private readonly options: AudioChunkExtractorOptions) {
    this.status = "pending";
    this.resolver = Promise.withResolvers();
    this.initialize().then(this.handleInitializeSuccess.bind(this), this.handleInitializeError.bind(this));
  }

  private handleInitializeError(error: Error) {
    this.status = "error";
    this.resolver.reject(error);
  }

  private handleInitializeSuccess() {
    this.status = "ready";
    this.resolver.resolve();
  }

  private async initialize() {
    this.context = new AudioContext();
    this.element = await this.createElementFromFile();

    this.source = this.context.createMediaElementSource(this.element);
    this.destination = this.context.createMediaStreamDestination();
    this.source.connect(this.destination);

    const mimeType = this.supportedMimeType(this.options.mimeType);
    const audioBitsPerSecond = this.options.audioBitsPerSecond || this.mAudioBitsPerSeoncd;

    this.recorder = new MediaRecorder(this.destination.stream, { mimeType, audioBitsPerSecond });
    this.recorder.ondataavailable = this.handleDataAvailable.bind(this);
  }

  private supportedMimeType(mimeType: string) {
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      throw new Error("No supported audio MIME type found");
    } else {
      return mimeType;
    }
  }

  private async createElementFromFile() {
    return new Promise<HTMLVideoElement>((resolve, reject) => {
      const element = document.createElement("video");
      element.src = URL.createObjectURL(this.file);
      element.addEventListener("error", reject, { once: true });
      element.addEventListener("loadedmetadata", () => resolve(element), { once: true });
      element.load();
    });
  }

  private async handleDataAvailable(event: BlobEvent) {
    if (!this.options.onChunk || event.data.size === 0) return;
    try {
      const arrayBuffer = await event.data.arrayBuffer();
      const timestamp = this.element.currentTime * 1000000; // microseconds
      const duration = (event.data.size / (this.options.audioBitsPerSecond || 128000)) * 8 * 1000000;

      const chunk = new EncodedAudioChunk({ type: "key", timestamp, duration, data: arrayBuffer });
      this.options.onChunk(chunk, timestamp);
    } catch (error) {
      console.error("Error processing audio chunk:", error);
    }
  }

  get state() {
    return {
      mimeType: this.recorder.mimeType,
      recordingState: this.recorder.state,
      audioBitsPerSecond: this.recorder.audioBitsPerSecond,
    };
  }

  async load() {
    if (this.status === "ready") return;
    return await this.resolver.promise;
  }

  start(timeslice: number = 100) {
    this.recorder.start(timeslice);
  }

  stop() {
    if (this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
  }

  pause() {
    if (this.recorder.state === "recording") {
      this.recorder.pause();
    }
  }

  resume() {
    if (this.recorder.state === "paused") {
      this.recorder.resume();
    }
  }

  destroy() {
    this.stop();
    this.source.disconnect();
    this.destination.disconnect();
    this.context.close();
  }
}
