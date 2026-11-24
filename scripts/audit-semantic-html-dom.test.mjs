import test from "node:test";
import assert from "node:assert/strict";
import { invalidHtmlReason, rawLandmarkCounts } from "./audit-semantic-html-dom.mjs";

const page = (body, title = "Authors | Achieve") =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}${"x".repeat(600)}</body></html>`;

test("accepts a genuine 200 HTML page", () => {
  assert.equal(
    invalidHtmlReason({
      status: 200,
      contentType: "text/html; charset=utf-8",
      html: page("<main><h1>Hi</h1></main>"),
    }),
    null,
  );
});

test("rejects non-200, non-HTML, tiny, truncated and challenge responses", () => {
  const ok = page("<h1>x</h1>");
  assert.match(
    invalidHtmlReason({ status: 403, contentType: "text/html", html: ok }),
    /status 403/,
  );
  assert.match(
    invalidHtmlReason({ status: 200, contentType: "application/json", html: ok }),
    /content-type/,
  );
  assert.match(
    invalidHtmlReason({ status: 200, contentType: "text/html", html: "<html></html>" }),
    /tiny/,
  );
  assert.match(
    invalidHtmlReason({ status: 200, contentType: "text/html", html: ok.replace("</html>", "") }),
    /truncated/,
  );
  for (const t of ["Just a moment...", "Attention Required! | Cloudflare", "Access Denied"])
    assert.match(
      invalidHtmlReason({ status: 200, contentType: "text/html", html: page("", t) }),
      /challenge/,
    );
  assert.match(
    invalidHtmlReason({
      status: 200,
      contentType: "text/html",
      html: page('<div class="cf-browser-verification"></div>'),
    }),
    /challenge/,
  );
});

test("raw landmark counts ignore scripts, templates, noscript and comments", () => {
  const html = page(
    "<header></header><nav></nav><main><h1>A</h1></main><footer></footer>" +
      '<script>"<h1>no</h1>"</script><template><main></main></template><noscript><h1>n</h1></noscript><!-- <nav> -->',
  );
  assert.deepEqual(rawLandmarkCounts(html), { h1: 1, main: 1, header: 1, footer: 1, nav: 1 });
});

test("React streamed segments (<div hidden id=S:0>) still count as server HTML", () => {
  const html = page(
    '<template id="B:0"></template><div hidden id="S:0"><main><h1>Achieve Authors</h1></main></div>',
  );
  assert.equal(rawLandmarkCounts(html).h1, 1);
  assert.equal(rawLandmarkCounts(html).main, 1);
});
