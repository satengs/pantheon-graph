import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getStudioUser } from "@/lib/server/demo-session";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user } = useCurrentUserState();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("origin.demo") === "1") {
        setOk(true);
        return;
      }
    } catch {
      /* ignore */
    }
    void getStudioUser()
      .then((u) => setOk(Boolean(u)))
      .catch(() => setOk(false));
  }, []);

  if (user) return <Studio />;
  if (ok === null) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-sm text-muted">
        Loading session…
      </div>
    );
  }
  if (!ok) return <RedirectToSignIn />;
  return <Studio />;
}
