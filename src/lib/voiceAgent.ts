// Voice-interview client for the self-hosted agent WebSocket (replaces LiveKit).
//
// Protocol (see backend agent/server.py):
//   client -> server : binary WAV frame (one candidate utterance),
//                       {"type":"end"} | {"type":"ping","t":...}
//   server -> client : {"type":"transcript","text"}, {"type":"reply_chunk","text"},
//                       binary WAV frame (audio for the preceding reply_chunk),
//                       {"type":"reply_done"}, {"type":"pong"}, {"type":"error","detail"}
//
// Turn-taking is client-side: we capture the mic, run a simple energy-based VAD to
// detect end-of-utterance, encode the utterance to a 16 kHz mono WAV, and send it.
// The interviewer's reply audio is played back in order via the Web Audio API.

export type CallPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "ended"
  | "error";

export type Caption = { speaker: "candidate" | "interviewer"; text: string };

export interface VoiceAgentHandlers {
  onPhase: (p: CallPhase) => void;
  onCaptions: (captions: Caption[]) => void;
  onError: (message: string) => void;
  onClose: () => void;
  // Fired when the mic analyser is ready (capture start) / gone (teardown), so the UI
  // can draw a live input-level graph. Optional.
  onAnalyser?: (analyser: AnalyserNode | null) => void;
}

// --- energy-VAD tuning ------------------------------------------------------
const TARGET_SR = 16000;
const FRAME = 2048; // ~128 ms per ScriptProcessor frame at 16 kHz
const FRAME_MS = (FRAME / TARGET_SR) * 1000;
const START_RMS = 0.018; // above this = speech onset
const KEEP_RMS = 0.009; // hysteresis: stay in speech until below this (low → tolerate quiet tails)
const START_MS = 160; // sustained voice needed to start capturing
const END_SILENCE_MS = 1400; // trailing silence that ends an utterance (higher → waits longer before replying)
const MIN_UTTERANCE_MS = 300; // drop shorter blips (coughs / clicks)

export class VoiceAgentClient {
  private ws?: WebSocket;
  private audioCtx?: AudioContext;
  private micStream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private sink?: GainNode; // muted sink so the processor keeps firing without echo
  private analyser?: AnalyserNode; // passive tap for the live mic-level UI
  private ping?: ReturnType<typeof setInterval>;

  private captions: Caption[] = [];
  private botCaptionIdx: number | null = null;

  private botSpeaking = false;
  private playQueue: AudioBuffer[] = [];
  private playing = false;
  private nextStartTime = 0;

  // VAD state
  private capturing = false;
  private voicedMs = 0;
  private silenceMs = 0;
  private buffer: Float32Array[] = [];

  private muted = false;
  private ended = false;

  constructor(
    private readonly wsUrl: string,
    private readonly h: VoiceAgentHandlers,
  ) {}

  async start(): Promise<void> {
    this.h.onPhase("connecting");
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    // One 16 kHz context for both capture and playback; decodeAudioData resamples
    // the (22 kHz) TTS WAVs to this rate automatically.
    this.audioCtx = new AudioContext({ sampleRate: TARGET_SR });
    if (this.audioCtx.state === "suspended") await this.audioCtx.resume();

    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => {
      this.h.onPhase("listening");
      this.startCapture();
      this.ping = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN)
          this.ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
      }, 20000);
    };
    this.ws.onmessage = (ev) => this.onMessage(ev);
    this.ws.onerror = () => this.h.onError("connection error");
    this.ws.onclose = () => {
      if (this.ended) return;
      this.ended = true;
      this.teardownAudio();
      this.h.onPhase("ended");
      this.h.onClose();
    };
  }

  /** Mute/unmute the mic: disable the track (analyser goes silent → flat meter) and
   * drop any in-progress utterance so nothing is sent while muted. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.micStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    if (muted) {
      this.buffer = [];
      this.capturing = false;
      this.voicedMs = 0;
      this.silenceMs = 0;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** End the call: tell the agent to stop, then tear everything down. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    try {
      if (this.ws?.readyState === WebSocket.OPEN)
        this.ws.send(JSON.stringify({ type: "end" }));
    } catch {
      /* ignore */
    }
    this.teardownAudio();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.h.onPhase("ended");
  }

  // --- mic capture + energy VAD --------------------------------------------

  private startCapture(): void {
    const ctx = this.audioCtx!;
    this.source = ctx.createMediaStreamSource(this.micStream!);
    this.processor = ctx.createScriptProcessor(FRAME, 1, 1);
    this.processor.onaudioprocess = (e) =>
      this.onFrame(e.inputBuffer.getChannelData(0));
    // Route through a muted gain node → destination so onaudioprocess keeps firing
    // (some browsers require the node to be connected) without echoing the mic.
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(this.sink);
    this.sink.connect(ctx.destination);

    // Passive frequency tap for the live mic-level graph (independent of VAD gating).
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    this.source.connect(this.analyser);
    this.h.onAnalyser?.(this.analyser);
  }

  private onFrame(frame: Float32Array): void {
    if (this.muted || this.botSpeaking || this.ended) return; // ignore while muted / agent speaks

    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);

    if (this.capturing) {
      this.buffer.push(new Float32Array(frame)); // copy (the source buffer is reused)
      if (rms >= KEEP_RMS) {
        this.silenceMs = 0;
      } else {
        this.silenceMs += FRAME_MS;
        if (this.silenceMs >= END_SILENCE_MS) this.finishUtterance();
      }
    } else if (rms >= START_RMS) {
      this.voicedMs += FRAME_MS;
      if (this.voicedMs >= START_MS) {
        this.capturing = true;
        this.silenceMs = 0;
        this.buffer = [new Float32Array(frame)];
      }
    } else {
      this.voicedMs = 0;
    }
  }

  private finishUtterance(): void {
    const frames = this.buffer;
    this.buffer = [];
    this.capturing = false;
    this.voicedMs = 0;
    this.silenceMs = 0;

    const total = frames.reduce((n, f) => n + f.length, 0);
    if ((total / TARGET_SR) * 1000 < MIN_UTTERANCE_MS) return; // too short — noise

    const samples = new Float32Array(total);
    let off = 0;
    for (const f of frames) {
      samples.set(f, off);
      off += f.length;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.h.onPhase("thinking");
      this.ws.send(encodeWAV(samples, TARGET_SR));
    }
  }

  // --- server messages ------------------------------------------------------

  private onMessage(ev: MessageEvent): void {
    if (typeof ev.data === "string") {
      let m: { type?: string; text?: string; detail?: string };
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.type === "transcript") {
        this.botCaptionIdx = null;
        if (m.text) this.pushCaption({ speaker: "candidate", text: m.text });
      } else if (m.type === "reply_chunk") {
        this.appendInterviewer(m.text ?? "");
      } else if (m.type === "reply_done") {
        this.botCaptionIdx = null;
      } else if (m.type === "error") {
        this.h.onError(m.detail || "agent error");
      }
      // pong: ignored
    } else {
      void this.enqueueAudio(ev.data as ArrayBuffer);
    }
  }

  private pushCaption(c: Caption): void {
    this.captions = [...this.captions, c];
    this.h.onCaptions(this.captions);
  }

  private appendInterviewer(text: string): void {
    if (!text) return;
    if (this.botCaptionIdx === null) {
      this.captions = [...this.captions, { speaker: "interviewer", text }];
      this.botCaptionIdx = this.captions.length - 1;
    } else {
      const next = [...this.captions];
      next[this.botCaptionIdx] = {
        speaker: "interviewer",
        text: `${next[this.botCaptionIdx].text} ${text}`.trim(),
      };
      this.captions = next;
    }
    this.h.onCaptions(this.captions);
  }

  // --- ordered playback -----------------------------------------------------

  private async enqueueAudio(ab: ArrayBuffer): Promise<void> {
    const ctx = this.audioCtx;
    if (!ctx || this.ended) return;
    if (ctx.state === "suspended") await ctx.resume();
    try {
      const buf = await ctx.decodeAudioData(ab.slice(0));
      this.playQueue.push(buf);
      this.schedule();
    } catch {
      /* undecodable frame — skip */
    }
  }

  private schedule(): void {
    const ctx = this.audioCtx!;
    const now = ctx.currentTime;
    if (!this.playing || this.nextStartTime < now) this.nextStartTime = now;
    while (this.playQueue.length) {
      const buf = this.playQueue.shift()!;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(this.nextStartTime);
      this.nextStartTime += buf.duration;
      this.playing = true;
      this.botSpeaking = true;
      if (!this.ended) this.h.onPhase("speaking");
      src.onended = () => {
        if (
          ctx.currentTime >= this.nextStartTime - 0.05 &&
          this.playQueue.length === 0
        ) {
          this.playing = false;
          this.botSpeaking = false;
          if (!this.ended) this.h.onPhase("listening");
        }
      };
    }
  }

  private teardownAudio(): void {
    if (this.ping) clearInterval(this.ping);
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.sink?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    this.h.onAnalyser?.(null);
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.audioCtx?.close().catch(() => {});
  }
}

/** Encode Float32 PCM (mono, already at `sr`) into a 16-bit WAV ArrayBuffer. */
function encodeWAV(samples: Float32Array, sr: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}
