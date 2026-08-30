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
        tone === "fdr" && "bg-fdr/20 text-fdr",
        tone === "achieve" && "bg-achieve/20 text-achieve",
        tone === "danger" && "bg-danger/20 text-danger",
        tone === "ok" && "bg-ok/20 text-ok",
        tone === "warn" && "bg-warn/20 text-warn",
        className,
      )}
    >
      {children}
    </span>
  );
}
