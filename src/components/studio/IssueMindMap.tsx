import { ISSUE_MAPS, type MapTree } from "@/data/issue-maps";

function Tree({ title, tree, tone }: { title: string; tree: MapTree; tone: "danger" | "ok" }) {
  const rootClass = tone === "danger" ? "bg-danger/15 text-danger" : "bg-ok/15 text-ok";
  return (
    <div>
      <p className="vh-kicker mb-2">{title}</p>
      <div className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${rootClass}`}>{tree.root}</div>
      <ul className="mm-tree mt-2">
        {tree.branches.map((b) => (
          <li key={b.label}>
            <span className="text-sm text-fg">{b.label}</span>
            {b.kids?.length ? (
              <ul>
                {b.kids.map((k) => (
                  <li key={k} className="text-xs text-muted">
                    {k}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IssueMindMap({ code }: { code: string }) {
  const map = ISSUE_MAPS[code];
  if (!map) return null;
  return (
    <section>
      <p className="vh-kicker">Mind map</p>
      <div className={`mt-2 grid gap-5 ${map.observed ? "sm:grid-cols-2" : ""}`}>
        {map.observed ? <Tree title="Google sees" tree={map.observed} tone="danger" /> : null}
        <Tree title="Fix toward" tree={map.intended} tone="ok" />
      </div>
    </section>
  );
}
