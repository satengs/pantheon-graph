import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg text-sm text-muted">
        Loading session…
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <Studio />;
}
