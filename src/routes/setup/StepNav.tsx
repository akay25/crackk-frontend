// Shared bottom row for each Setup step: Back / (step-specific action) / Next.
// The step passes its primary action as children and whether Next may advance; the
// Back/Next navigation is driven by the stepper position in SetupContext.
import type { ReactNode } from "react";
import { Button } from "../../components/ui";
import { SETUP_STEPS, useSetup } from "./SetupContext";

export default function StepNav({
  canAdvance,
  children,
}: {
  /** Whether "Next" is enabled (i.e. this step's accepted event has landed). */
  canAdvance: boolean;
  /** Step-specific primary action(s), shown to the left of Next. */
  children?: ReactNode;
}) {
  const { currentIndex, goToIndex } = useSetup();
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === SETUP_STEPS.length - 1;

  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
      <Button variant="secondary" onClick={() => goToIndex(currentIndex - 1)} disabled={isFirst}>
        ← Back
      </Button>
      <div className="flex items-center gap-3">
        {children}
        {!isLast && (
          <Button onClick={() => goToIndex(currentIndex + 1)} disabled={!canAdvance}>
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}
