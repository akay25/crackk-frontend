// Client-side PDF preview. Renders every page of a selected (not-yet-uploaded)
// PDF to a canvas with pdf.js, so the candidate sees exactly what they're about to
// send. Pure browser work — nothing leaves the page until they press Upload.
// PDFs longer than `maxPages` are rejected up front (no render) and reported as
// invalid so the parent can block the upload.
import { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
// Let Vite bundle the worker as its own chunk and instantiate it. Using `?worker`
// (instead of `?url`) emits a `.js` chunk Vite controls and wires up the Worker for
// us, so we avoid the `.mjs` module-worker path that breaks when a static host serves
// `.mjs` with the wrong MIME type. pdf.js drives it through `workerPort`.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { Spinner } from "./ui";

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export default function PdfPreview({
  file,
  maxPages = 3,
  onValidityChange,
}: {
  file: File;
  maxPages?: number;
  /** Reports whether this PDF is allowed to be uploaded (false once over maxPages). */
  onValidityChange?: (valid: boolean) => void;
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Hard rejection (over the page limit) vs. a soft render failure.
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlocked(false);
    setPages([]);

    (async () => {
      try {
        const data = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data }).promise;

        // Enforce the page cap before doing any rendering work.
        if (pdf.numPages > maxPages) {
          if (!cancelled) {
            setBlocked(true);
            setError(
              `This PDF has ${pdf.numPages} pages. Please upload a resume with ${maxPages} pages or fewer.`,
            );
            onValidityChange?.(false);
          }
          return;
        }

        const urls: string[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) return;
          const page = await pdf.getPage(n);
          // Small render scale — these are matchbox thumbnails, not readable pages.
          const viewport = page.getViewport({ scale: 0.6 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          urls.push(canvas.toDataURL("image/png"));
        }
        if (!cancelled) {
          setPages(urls);
          onValidityChange?.(true);
        }
      } catch {
        if (!cancelled) {
          // Couldn't render, but don't block the upload on a preview glitch.
          setError("Couldn't render a preview of this PDF.");
          onValidityChange?.(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, maxPages, onValidityChange]);

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
        <Spinner className="size-4 text-indigo-500" />
        Rendering preview…
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {error}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {error} You can still upload it.
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-slate-500">
        {pages.length} {pages.length === 1 ? "page" : "pages"}
      </p>
      <div className="flex flex-wrap gap-3">
        {pages.map((src, i) => (
          <div
            key={i}
            className="w-20 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
          >
            <img src={src} alt={`Page ${i + 1}`} className="block w-full" />
            <div className="border-t border-slate-100 py-0.5 text-center text-[10px] text-slate-400">
              {i + 1}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
