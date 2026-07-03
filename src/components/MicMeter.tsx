import { useEffect, useRef, useState } from "react";
import { cn } from "./ui";
import type { CallPhase } from "../lib/voiceAgent";

const BARS = 7;
const SPEAKING_LEVEL = 0.07; // avg normalized level above which we call it "speaking"

// A mic icon + a live audio-level graph fed by the client's AnalyserNode. Shows
// whether the candidate is speaking (bars react + turn green) during their turn.
export default function MicMeter({
  analyser,
  phase,
  vad,
  muted = false,
}: {
  analyser: AnalyserNode | null;
  phase: CallPhase;
  vad?: { remainingMs: number; totalMs: number } | null;
  muted?: boolean;
}) {
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const rafRef = useRef<number | undefined>(undefined);
  const phaseRef = useRef<CallPhase>(phase);
  const mutedRef = useRef(muted);
  const speakingRef = useRef(false);
  const [speaking, setSpeaking] = useState(false);

  // Keep the animation loop reading the latest phase/muted without restarting the rAF.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const idle = () =>
      barRefs.current.forEach((b) => {
        if (b) b.style.transform = "scaleY(0.16)";
      });

    if (!analyser) {
      idle();
      if (speakingRef.current) {
        speakingRef.current = false;
        setSpeaking(false);
      }
      return;
    }

    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      // Only reflect the mic during the candidate's turn (and when not muted); while
      // the interviewer speaks / we're thinking / muted, we park the bars.
      const listening = phaseRef.current === "listening" && !mutedRef.current;
      if (listening) {
        analyser.getByteFrequencyData(data);
        const n = Math.min(data.length, 48);
        let sum = 0;
        for (let i = 0; i < BARS; i++) {
          const lo = Math.floor((i / BARS) * n);
          const hi = Math.max(lo + 1, Math.floor(((i + 1) / BARS) * n));
          let s = 0;
          for (let j = lo; j < hi; j++) s += data[j];
          const v = s / (hi - lo) / 255; // 0..1
          sum += v;
          const h = 0.16 + Math.min(1, v * 2.4) * 0.84;
          const bar = barRefs.current[i];
          if (bar) bar.style.transform = `scaleY(${h.toFixed(3)})`;
        }
        const spk = sum / BARS > SPEAKING_LEVEL;
        if (spk !== speakingRef.current) {
          speakingRef.current = spk;
          setSpeaking(spk);
        }
      } else {
        idle();
        if (speakingRef.current) {
          speakingRef.current = false;
          setSpeaking(false);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser]);

  const live = phase === "listening" && !muted;
  const active = speaking && live;

  // End-of-turn countdown gauge: full while speaking (or before any speech), drains
  // through the trailing silence, and refills the instant the candidate speaks again.
  const fraction = vad
    ? Math.max(0, Math.min(1, vad.remainingMs / vad.totalMs))
    : 1;
  const draining = live && fraction < 0.995;

  const label = muted
    ? "Microphone muted"
    : phase === "speaking"
      ? "Muted while interviewer speaks"
      : phase === "thinking"
        ? "Thinking…"
        : phase === "connecting"
          ? "Connecting…"
          : draining
            ? `Sending in ${(vad!.remainingMs / 1000).toFixed(1)}s`
            : speaking
              ? "You're speaking"
              : "Listening — go ahead";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-white px-4 py-2.5",
        muted ? "border-rose-200" : "border-slate-200",
      )}
    >
      <span
        className={cn(
          "grid size-9 place-items-center rounded-full transition-colors",
          muted
            ? "bg-rose-100 text-rose-500"
            : active
              ? "bg-emerald-500 text-white"
              : live
                ? "bg-slate-100 text-slate-500"
                : "bg-slate-100 text-slate-300",
        )}
      >
        {muted ? (
          // Muted mic (slashed).
          <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth={1.8}>
            <path d="M12 3a3 3 0 0 0-3 3v5m0 0a3 3 0 0 0 5.1 2.1M15 9V6a3 3 0 0 0-3-3" strokeLinecap="round" />
            <path d="M5 11a7 7 0 0 0 10.5 6.06M19 11v0M12 18v3M9 21h6" strokeLinecap="round" />
            <path d="m4 4 16 16" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth={1.8}>
            <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" strokeLinecap="round" />
          </svg>
        )}
      </span>

      {/* live level bars */}
      <div className="flex h-8 items-center gap-1">
        {Array.from({ length: BARS }).map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className={cn(
              "block h-8 w-1 origin-center rounded-full transition-colors",
              muted
                ? "bg-rose-200"
                : active
                  ? "bg-emerald-500"
                  : live
                    ? "bg-indigo-300"
                    : "bg-slate-200",
            )}
            style={{ transform: "scaleY(0.16)" }}
          />
        ))}
      </div>

      {/* End-of-turn countdown gauge — how long until this utterance is sent. */}
      {live && (
        <div
          className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200"
          title={`Sending in ${(fraction * (vad?.totalMs ?? 0) / 1000).toFixed(1)}s`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-150 ease-linear",
              fraction > 0.5
                ? "bg-indigo-400"
                : fraction > 0.2
                  ? "bg-amber-400"
                  : "bg-rose-400",
            )}
            style={{ width: `${(fraction * 100).toFixed(1)}%` }}
          />
        </div>
      )}

      <span className={cn("text-sm font-medium", muted ? "text-rose-500" : "text-slate-500")}>
        {label}
      </span>
    </div>
  );
}
