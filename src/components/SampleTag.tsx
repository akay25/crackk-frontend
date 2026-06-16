/** Tiny label marking a value that isn't real report data yet. */
export default function SampleTag({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={
        "ml-2 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide align-middle " +
        (onDark ? "bg-white/20 text-white/90" : "bg-slate-100 text-slate-400")
      }
    >
      sample
    </span>
  );
}
