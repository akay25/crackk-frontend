import { createContext, useContext } from "react";

// Local imports
import { SetupContextValue } from "../types/SetupPage";
export const SetupContext = createContext<SetupContextValue | null>(null);

export function useSetup(): SetupContextValue {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error("useSetup must be used within <SetupLayout>");
  return ctx;
}
