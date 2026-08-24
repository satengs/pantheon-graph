import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    try {
      setDemo(sessionStorage.getItem("origin.demo") === "1");
    } catch {
      setDemo(false);
    }
  }, []);
  if (isPending && !demo) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-sm text-muted">
        Loading session…
      </div>
    );
  }
  if (!user && !demo) return <RedirectToSignIn />;
  return <Studio />;
}
