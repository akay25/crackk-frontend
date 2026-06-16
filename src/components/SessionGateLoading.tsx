import { Shell, Spinner } from "./ui";

export default function Loading() {
  return (
    <Shell>
      <div className="flex flex-col items-center py-20">
        <Spinner className="size-7 text-indigo-500" />
        <p className="mt-3 font-medium text-slate-700">Loading…</p>
      </div>
    </Shell>
  );
}