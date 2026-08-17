/*
 * Loads the app at mobile and desktop widths and checks the two things
 * only a browser can answer: horizontal overflow, and whether React
 * logged a hydration mismatch.
 *
 *   node scripts/verify-viewports.mjs            # expects a server on :3210
 *   BASE=http://localhost:3000 node scripts/...  # or point it elsewhere
 *
 * WHY THIS EXISTS
 *
 * Leaflet writes its own inline styles and sizes tiles from the container,
 * so a map is the most likely thing on a page to push the document wider
 * than the viewport — and horizontal overflow on a phone is invisible in a
 * desktop browser. Hydration mismatches are the same shape of problem:
 * they only appear when the server-rendered HTML meets the client, which
 * `next build` does not exercise.
 *
 * WHY NO PLAYWRIGHT
 *
 * Chromium is pre-installed in this environment but the playwright package
 * is not, and adding a browser-automation dependency to ship one
 * verification script is a poor trade. This speaks CDP over the WebSocket
 * that Node 22 provides globally, so it has no dependencies at all.
 *
 * Public routes only: everything else redirects to sign-in without a
 * session, which is what scripts/verify-route-protection.sh asserts.
 */

import { spawn } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3210";
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium";

const VIEWPORTS = [
  { name: "mobile   320x568", width: 320, height: 568, mobile: true },
  { name: "mobile   375x667", width: 375, height: 667, mobile: true },
  { name: "tablet   768x1024", width: 768, height: 1024, mobile: false },
  { name: "desktop 1440x900", width: 1440, height: 900, mobile: false },
];

const PATHS = ["/", "/auth/login", "/auth/register"];

/* ---------- a very small CDP client ---------- */

let nextId = 1;

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const listeners = [];

    socket.addEventListener("open", () =>
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          return new Promise((ok, fail) => {
            pending.set(id, { ok, fail });
            socket.send(JSON.stringify({ id, method, params, sessionId }));
          });
        },
        on(fn) {
          listeners.push(fn);
        },
        close: () => socket.close(),
      })
    );

    socket.addEventListener("error", () =>
      reject(new Error(`could not connect to ${url}`))
    );

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.id && pending.has(message.id)) {
        const { ok, fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          fail(new Error(message.error.message));
        } else {
          ok(message.result);
        }

        return;
      }

      for (const fn of listeners) fn(message);
    });
  });
}

/* ---------- launch ---------- */

const port = 9222 + Math.floor(Math.random() * 500);

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--user-data-dir=/tmp/citytrace-viewport-profile",
  ],
  { stdio: "ignore" }
);

process.on("exit", () => chrome.kill("SIGKILL"));

async function browserWebSocket() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      const { webSocketDebuggerUrl } = await response.json();
      if (webSocketDebuggerUrl) return webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Chromium did not expose a debugging endpoint");
}

const cdp = await connect(await browserWebSocket());

/* ---------- the checks ---------- */

/*
 * A 1px tolerance. Sub-pixel layout rounding routinely produces a
 * scrollWidth a fraction wider than clientWidth on a page that does not
 * actually scroll sideways, and failing on that would make the check
 * noise rather than signal.
 */
const OVERFLOW_TOLERANCE = 1;

let failures = 0;

for (const viewport of VIEWPORTS) {
  for (const path of PATHS) {
    const { targetId } = await cdp.send("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    const problems = [];

    cdp.on((message) => {
      if (message.sessionId !== sessionId) return;

      if (message.method === "Runtime.consoleAPICalled") {
        const text = (message.params.args ?? [])
          .map((a) => String(a.value ?? a.description ?? ""))
          .join(" ");

        if (/hydrat|did not match|Text content does not match/i.test(text)) {
          problems.push(`hydration: ${text.slice(0, 160)}`);
        }
      }

      if (message.method === "Runtime.exceptionThrown") {
        const detail = message.params.exceptionDetails;
        problems.push(
          `pageerror: ${String(
            detail.exception?.description ?? detail.text
          ).slice(0, 160)}`
        );
      }
    });

    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);

    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.mobile ? 2 : 1,
        mobile: viewport.mobile,
      },
      sessionId
    );

    if (viewport.mobile) {
      await cdp.send(
        "Emulation.setTouchEmulationEnabled",
        { enabled: true, maxTouchPoints: 5 },
        sessionId
      );
    }

    await cdp.send("Page.navigate", { url: `${BASE}${path}` }, sessionId);

    // Settle: the maps mount dynamically after first paint.
    await new Promise((r) => setTimeout(r, 2500));

    const { result } = await cdp.send(
      "Runtime.evaluate",
      {
        returnByValue: true,
        expression: `(() => {
          const doc = document.documentElement;
          const widest = Array.from(document.querySelectorAll('*'))
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { tag: el.tagName, cls: String(el.className).slice(0, 80), right: Math.round(r.right) };
            })
            .filter((e) => e.right > doc.clientWidth + ${OVERFLOW_TOLERANCE})
            .sort((a, b) => b.right - a.right)
            .slice(0, 3);

          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            widest,
          };
        })()`,
      },
      sessionId
    );

    const metrics = result.value;
    const overflows =
      metrics.scrollWidth > metrics.clientWidth + OVERFLOW_TOLERANCE;

    if (overflows || problems.length > 0) {
      failures += 1;
      console.log(`FAIL ${viewport.name}  ${path}`);

      if (overflows) {
        console.log(
          `     overflow: scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth}`
        );
        for (const el of metrics.widest) {
          console.log(`     <${el.tag}> right=${el.right} class="${el.cls}"`);
        }
      }

      for (const problem of problems) console.log(`     ${problem}`);
    } else {
      console.log(`ok   ${viewport.name}  ${path}`);
    }

    await cdp.send("Target.closeTarget", { targetId });
  }
}

cdp.close();
chrome.kill("SIGKILL");

console.log("");

if (failures > 0) {
  console.log(`${failures} viewport check(s) failed.`);
  process.exit(1);
}

console.log("All viewport checks passed: no horizontal overflow, no hydration mismatch.");
