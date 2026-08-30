import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveNote } from "@/lib/server/studio-db";

export function NotesDrawer({
  open,
  onClose,
  pageKey,
  draft,
  onDraft,
}: {
  open: boolean;
  onClose: () => void;
  pageKey: string;
  draft: string;
  onDraft: (v: string) => void;
}) {
  const titleId = useId();
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!ready || !open) return null;

  return createPortal(
    <aside
      role="dialog"
      aria-labelledby={titleId}
      className="drawer-in fixed inset-y-0 right-0 z-[65] flex h-full w-[min(420px,100vw)] flex-col border-l border-border bg-surface shadow-[var(--shadow-border)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="vh-kicker">Notes</p>
          <h2 id={titleId} className="mt-1 text-sm text-fg">
            {pageKey}
          </h2>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close notes">
          <X />
        </Button>
      </header>
      <textarea
        value={draft}
        onChange={(e) => {
          onDraft(e.target.value);
          setSaved(false);
        }}
        placeholder="Draft the fix or copy for this selection"
        className="min-h-0 flex-1 resize-none bg-bg p-4 text-sm text-fg"
      />
      <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Button
          size="sm"
          onClick={() => {
            setErr(null);
            void saveNote({ data: { pageKey, body: draft } })
              .then(() => setSaved(true))
              .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Save failed"));
          }}
        >
          {saved ? "Saved" : "Save"}
        </Button>
        {err ? <p className="text-xs text-danger">{err}</p> : null}
      </footer>
    </aside>,
    document.body,
  );
}
