import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "fdr" | "achieve" | "danger" | "ok" | "warn";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-[10px] font-medium uppercase tracking-wide",
        tone === "neutral" && "bg-raised text-muted",
        tone === "fdr" && "bg-fdr/15 text-fdr",
        tone === "achieve" && "bg-achieve/15 text-achieve",
        tone === "danger" && "bg-danger/15 text-danger",
        tone === "ok" && "bg-ok/15 text-ok",
        tone === "warn" && "bg-warn/15 text-warn",
        className,
      )}
    >
      {children}
    </span>
  );
}
