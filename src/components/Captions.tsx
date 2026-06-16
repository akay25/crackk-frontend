import { useEffect, useRef } from "react";
import { useTranscriptions } from "@livekit/components-react";
import { Card } from "./ui";

export default function Captions({ localIdentity }: { localIdentity: string }) {
  const transcriptions = useTranscriptions();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest caption in view as the transcript grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcriptions]);

  // Show the interviewer's words verbatim; collapse the candidate's turns into a
  // single "speaking" placeholder (we don't surface what they say).
  const items: { isYou: boolean; text: string }[] = [];
  for (const seg of transcriptions) {
    const isYou = seg.participantInfo.identity === localIdentity;
    if (isYou) {
      if (items.length && items[items.length - 1].isYou) continue;
      items.push({ isYou: true, text: "" });
    } else {
      items.push({ isYou: false, text: seg.text });
    }
  }

  return (
    <Card className="mt-5 p-0">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <svg viewBox="0 0 24 24" fill="none" className="size-4 text-slate-400" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 15h4m2 0h4M7 11h2m2 0h6" strokeLinecap="round" />
        </svg>
        <span className="text-sm font-semibold text-slate-700">Live captions</span>
      </div>
      <div ref={scrollRef} className="h-[22rem] space-y-3 overflow-y-auto px-5 py-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">The interviewer's captions will appear here…</p>
        ) : (
          items.map((item, i) =>
            item.isYou ? (
              // We don't show what the candidate says — just a "speaking" indicator.
              <div key={i} className="flex justify-end">
                <div className="flex items-center gap-1 rounded-2xl rounded-br-sm bg-slate-100 px-3.5 py-3">
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-slate-400" />
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-sm text-slate-800">
                  <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Interviewer</span>
                  {item.text}
                </div>
              </div>
            ),
          )
        )}
      </div>
    </Card>
  );
}
