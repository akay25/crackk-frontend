import { useEffect, useRef, useState } from "react";
import { setConfig } from "../../api/session";
import type { ConfigInput, Role } from "../../types/api";
import { failedStage, reached } from "../../utils";
import { Button, Input, Label, Spinner } from "../../components/ui";
import { useSetup } from "../../context/SetupContext";
import StepNav from "../../components/StepNav";

const ROLES: Role[] = ["junior", "mid", "senior", "staff"];

export default function ConfigStep() {
  const { sessionId, session, state, setErr, refresh, configDone } = useSetup();

  // A failed resume blocks saving config — there's nothing valid to configure against.
  const resumeFailed = failedStage(state) === "resume";

  const [targetPay, setTargetPay] = useState("");
  const [roleTitle, setRoleTitle] = useState<Role>("mid");
  const [configBusy, setConfigBusy] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const configInited = useRef(false);

  // One-time: seed the config form from the loaded session (so editing one field doesn't
  // wipe the others) and decide whether Save starts enabled.
  useEffect(() => {
    if (!session || configInited.current) return;
    configInited.current = true;
    setTargetPay(session.target_pay ?? "");
    // @ts-ignore
    setRoleTitle(session.role_title ?? "mid");
    setConfigDirty(
      !reached(
        { stage: session.stage, status: session.status },
        "difficulty_set",
      ),
    );
  }, [session]);

  async function onConfig(e?: React.FormEvent) {
    e?.preventDefault();
    if (!sessionId || resumeFailed) return;
    setErr(null);
    setConfigBusy(true);
    const input: ConfigInput = {
      role_title: roleTitle,
    };
    if (targetPay.trim()) input.target_pay = targetPay.trim();
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

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">
        Difficulty, pay & role
      </h2>
      <div className="mt-4 space-y-4">
        <div>
          <Label>Role</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ROLES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setRoleTitle(d);
                  setConfigDirty(true);
                }}
                className={
                  "rounded-xl border px-3 py-2 text-sm font-medium capitalize transition " +
                  (roleTitle === d
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
              placeholder="₹20L"
              value={targetPay}
              onChange={(e) => {
                setTargetPay(e.target.value);
                setConfigDirty(true);
              }}
            />
          </div>
        </div>
      </div>

      {/* Next checks resume × JD eligibility, then auto-builds the interview. */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <p className="text-sm text-slate-600">
          Save your settings, then continue to check your eligibility — we score
          your resume against the job before building the interview.
        </p>
      </div>

      <StepNav canAdvance={configDone}>
        {!resumeFailed && (
          <Button
            variant="secondary"
            onClick={() => onConfig()}
            disabled={configBusy || !configDirty || resumeFailed}
          >
            {configBusy ? <Spinner /> : configDone ? "Update" : "Save"}
          </Button>
        )}
      </StepNav>
    </div>
  );
}
