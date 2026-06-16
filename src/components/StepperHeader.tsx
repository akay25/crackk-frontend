import { Fragment } from "react/jsx-runtime";

// Local imports
import { cn } from "./ui";
import CheckboxRound from "./CheckboxRound";
import { SETUP_STEPS } from "../routes/setup/SetupContext";

/** Horizontal stepper: numbered/checked dots with connectors; click to jump back. */
export default function StepperHeader({
  current,
  done,
  canGo,
  onJump,
}: {
  current: number;
  done: boolean[];
  canGo: (i: number) => boolean;
  onJump: (i: number) => void;
}) {
  return (
    <nav className="flex items-center">
      {SETUP_STEPS.map(({ title }, i) => {
        const isDone = done[i];
        const active = i === current;
        const reachable = canGo(i);
        return (
          <Fragment key={title}>
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              disabled={!reachable}
              className={cn(
                "flex items-center gap-2",
                reachable ? "cursor-pointer" : "cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition",
                  isDone
                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                    : active
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                      : "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200",
                )}
              >
                {isDone ? <CheckboxRound /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  active ? "text-slate-900" : "text-slate-500",
                )}
              >
                {title}
              </span>
            </button>
            {i < SETUP_STEPS.length - 1 && (
              <span
                className={cn(
                  "mx-2 h-px flex-1 transition-colors",
                  done[i] ? "bg-emerald-300" : "bg-slate-200",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
