// Small Tailwind UI kit shared across screens. Keeps the routes declarative and
// the visual language consistent (rounded cards, indigo accent, soft shadows).
import { useEffect } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useSocketConnected } from "../lib/socket";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Centered modal dialog with a dimmed backdrop. Closes on backdrop click / Esc. */
export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        {children}
      </div>
    </div>
  );
}

/** App chrome: brand header + centered content column. */
export function Shell({ children, max = "max-w-2xl" }: { children: ReactNode; max?: string }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="shrink-0 border-b border-slate-200/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-5 py-3.5">
          <Logo />
          <span className="font-semibold tracking-tight text-slate-900">AI Interviewer</span>
          <span className="ml-auto">
            <ConnectionStatus />
          </span>
        </div>
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <main className={cn("mx-auto w-full flex-1 px-5 py-10", max)}>{children}</main>
        <Footer />
      </div>
    </div>
  );
}

/** Non-sticky page footer, shown across all screens. */
export function Footer() {
  return (
    <footer className="border-t border-slate-200/70 py-6 text-center text-sm text-slate-500">
      Made after eating chicken rice
    </footer>
  );
}

// Live-link indicator — connected / disconnected, from the Socket.IO connect events.
export function ConnectionStatus() {
  const isConnected = useSocketConnected();
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", isConnected ? "text-slate-500" : "text-rose-600")}
      title="Live connection status"
    >
      <span className={cn("size-1.5 rounded-full", isConnected ? "bg-emerald-500" : "bg-rose-500 animate-pulse")} />
      {isConnected ? "Connected" : "Disconnected"}
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/30",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-4.5" stroke="currentColor" strokeWidth={2}>
        <path d="M12 3a4 4 0 0 0-4 4v3a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/50 backdrop-blur",
        className,
      )}
    >
      {children}
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/30 focus-visible:outline-indigo-600",
  secondary:
    "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400",
  danger:
    "bg-rose-600 text-white hover:bg-rose-500 shadow-sm shadow-rose-600/30 focus-visible:outline-rose-600",
  ghost: "text-indigo-700 hover:bg-indigo-50 focus-visible:outline-indigo-400",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

const FIELD =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, className)} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, "resize-y", className)} {...props} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD, "appearance-none pr-9", className)} {...props} />;
}

type Tone = "slate" | "green" | "amber" | "rose" | "indigo";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  children,
  tone = "rose",
}: {
  children: ReactNode;
  tone?: "rose" | "amber";
}) {
  const styles =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", styles)}>{children}</div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
    </svg>
  );
}
