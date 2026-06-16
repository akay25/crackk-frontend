// Setup step 3 — difficulty / pay / role, then "Build the interview". Save persists the
// config (moves the session to difficulty_set); Build kicks off blueprint generation.
// When the blueprint becomes ready, SetupLayout's global "join" modal takes over.
import { useEffect, useRef, useState } from "react";
import { buildBlueprint, setConfig, type ConfigInput, type Difficulty } from "../../lib/api";
import { parseStatus, reached } from "../../lib/socket";
import { Button, Input, Label, Spinner } from "../../components/ui";
import { useSetup } from "./SetupContext";
import StepNav from "./StepNav";

const DIFFICULTIES: Difficulty[] = ["junior", "mid", "senior", "staff"];

export default function ConfigStep() {
  const { sessionId, session, setErr, refresh, resumeReady, jdReady, configDone, hasBlueprint } = useSetup();

  const [difficulty, setDifficulty] = useState<Difficulty>("mid");
  const [targetPay, setTargetPay] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  // Save is enabled only when the form differs from what's saved. Goes false after a
  // successful save, true on any field edit. Seeded once from the loaded session.
  const [configDirty, setConfigDirty] = useState(false);
  const configInited = useRef(false);

  const [blueprintBusy, setBlueprintBusy] = useState(false);
  // True after the user kicks off a build this session, until the blueprint is ready —
  // drives the build button's loading state (the modal itself is driven by hasBlueprint).
  const [awaitingBuild, setAwaitingBuild] = useState(false);

  // The backend rejects blueprint generation unless a resume AND a JD are ready; gate the
  // button on all three steps being done.
  const canBuild = configDone && resumeReady && jdReady;

  // One-time: seed the config form from the loaded session (so editing one field doesn't
  // wipe the others) and decide whether Save starts enabled.
  useEffect(() => {
    if (!session || configInited.current) return;
    configInited.current = true;
    setTargetPay(session.target_pay ?? "");
    setRoleTitle(session.role_title ?? "");
    setConfigDirty(!reached(parseStatus(session.status), "difficulty_set"));
  }, [session]);

  // Once the blueprint is ready, resolve the build button's loading state.
  useEffect(() => {
    if (hasBlueprint && awaitingBuild) setAwaitingBuild(false);
  }, [hasBlueprint, awaitingBuild]);

  async function onConfig(e?: React.FormEvent) {
    e?.preventDefault();
    if (!sessionId) return;
    setErr(null);
    setConfigBusy(true);
    const input: ConfigInput = { difficulty };
    if (targetPay.trim()) input.target_pay = targetPay.trim();
    if (roleTitle.trim()) input.role_title = roleTitle.trim();
    try {
      await setConfig(sessionId, input);
      setConfigDirty(false); // saved — disable until the next edit
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setConfigBusy(false);
    }
  }

  async function onBuild(e?: React.FormEvent) {
    e?.preventDefault();
    if (!sessionId) return;
    setErr(null);
    setBlueprintBusy(true);
    try {
      await buildBlueprint(sessionId);
      setAwaitingBuild(true); // wait for blueprint→ready over the socket, then pop the join dialog
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBlueprintBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">Difficulty, pay & role</h2>
      <div className="mt-4 space-y-4">
        <div>
          <Label>Difficulty</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDifficulty(d);
                  setConfigDirty(true);
                }}
                className={
                  "rounded-xl border px-3 py-2 text-sm font-medium capitalize transition " +
                  (difficulty === d
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-400")
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Target pay (optional)</Label>
            <Input
              type="text"
              placeholder="$180k"
              value={targetPay}
              onChange={(e) => {
                setTargetPay(e.target.value);
                setConfigDirty(true);
              }}
            />
          </div>
          <div>
            <Label>Role title (optional)</Label>
            <Input
              type="text"
              placeholder="Senior Backend Engineer"
              value={roleTitle}
              onChange={(e) => {
                setRoleTitle(e.target.value);
                setConfigDirty(true);
              }}
            />
          </div>
        </div>
      </div>

      {/* Build the interview — enabled once resume + JD + config are set. */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Build the interview</h3>
        <p className="mt-1 text-sm text-slate-600">
          Generates a tailored question blueprint from your resume and the JD.
        </p>
        {!canBuild && (
          <p className="mt-2 text-sm text-slate-500">
            {!configDone ? "Save your settings first." : "Finish steps 1–2 first."}
          </p>
        )}
      </div>

      <StepNav canAdvance={configDone}>
        <Button variant="secondary" onClick={() => onConfig()} disabled={configBusy || !configDirty}>
          {configBusy ? <Spinner /> : configDone ? "Update" : "Save"}
        </Button>
        <Button onClick={() => onBuild()} disabled={blueprintBusy || awaitingBuild || !canBuild}>
          {blueprintBusy || awaitingBuild ? (
            <>
              <Spinner /> Building…
            </>
          ) : hasBlueprint ? (
            "Rebuild blueprint"
          ) : (
            "Build interview"
          )}
        </Button>
      </StepNav>
    </div>
  );
}
