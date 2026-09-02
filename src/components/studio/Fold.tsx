import { useState, type ReactNode } from "react";

export function Fold({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 py-1 text-left text-[10px] font-medium uppercase tracking-wide text-subtle hover:text-fg"
      >
        <span className="font-mono text-muted">{open ? "−" : "+"}</span>
        {title}
      </button>
      {open ? <div className="mt-1">{children}</div> : null}
    </section>
  );
}
