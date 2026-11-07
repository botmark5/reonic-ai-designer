#!/usr/bin/env node
/**
 * Deck stills and a time-of-day recording of <House3D>, rendered from live engine designs (no mock).
 *
 *   cd web && node scripts/house/export-stills.mjs [--base http://localhost:3000] [--out ../docs/deck/out/3d]
 *                                                   [--only stills|video] [--hour 8] [--theme light|dark]
 *                                                   [--scenes 1,2] [--size 16x9|4x5] [--upload]
 *
 * Without --base it copies scripts/house/export-page.tsx to src/app/house3d-export/, builds and starts the app
 * (`next build` + `next start`), and removes the page afterwards. The Next server must reach the engine (ENGINE_URL in web/.env.local); designs served by the
 * offline fallback are refused. Needs Google Chrome (CHROME_PATH to override) and ffmpeg. No npm dependencies:
 * it drives Chrome over the DevTools protocol with Node's built-in WebSocket (Node ≥ 22).
 *
 * Output (git-ignored): deck_3d_<n>_<name>_16x9.png (1920×1080), _4x5.png (1080×1350), deck_3d_day_16x9.mp4,
 * plus deck_3d_designs.json with the engine designs used. --upload puts them on the data-v1 release.
 */
import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
    return acc;
  }, []),
);
const OUT = resolve(WEB, args.out ?? "../docs/deck/out/3d");
// morning golden hour (mid-May, Munich): the low sun from the east warms the faces the street camera sees, and the
// panels already produce. Evening light falls on the west side, which this camera does not show.
const HOUR = Number(args.hour ?? 8);
const THEME = args.theme === "dark" ? "dark" : "light";
const SS = 2; // supersampling: render at 2× and downscale
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const INSTALLER = "2a8ba8e2";

const home = (p) => ({
  annual_kwh: 4000, price_eur_kwh: 0.32, load_profile: "H0", has_ev: false, ev_km_year: null, existing_pv_kwp: null,
  existing_battery_kwh: null, heating: "Gas", heating_demand_kwh: null, roof_type: "Concrete tile", house_sqm: 140,
  inhabitants: 4, has_existing_pv: false, demand_is_default: false, ...p,
});
/** The four deck homes. Sizes come from the engine at run time; the comments are what v1 returned on 2026-11-08. */
const SCENES = [
  { n: 1, name: "typical", home: home({}) }, // 9.45 kWp + 9.2 kWh
  { n: 2, name: "ev", home: home({ has_ev: true, ev_km_year: 12000 }) }, // 10.35 kWp + 10 kWh + wallbox
  { n: 3, name: "roof-capped", home: home({ roof_max_kwp: 5.85 }) }, // 5.85 kWp (13 panels) + 5 kWh
  { n: 4, name: "battery-retrofit", home: home({ has_existing_pv: true, existing_pv_kwp: 7.2 }) }, // + 5 kWh battery
];
const SIZES = [
  { tag: "16x9", w: 1920, h: 1080 },
  { tag: "4x5", w: 1080, h: 1350 },
];
const LOCKS = { pv_kwp: null, battery_kwh: null, wallbox: null, heatpump_kw: null };

const cleanup = [];
async function main() {
  mkdirSync(OUT, { recursive: true });
  const base = args.base ?? (await startServer());

  const designs = [];
  for (const s of SCENES) {
    const r = await fetch(`${base}/api/engine/design`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ installer: INSTALLER, home: s.home, locks: LOCKS }),
    });
    if (!r.ok) throw new Error(`design ${s.name}: HTTP ${r.status}`);
    const design = await r.json();
    if (design.served?.source !== "engine") throw new Error(`design ${s.name} was served by "${design.served?.source}", not the engine`);
    const d = design.design;
    console.log(`${s.n} ${s.name.padEnd(17)} PV ${d.pv.include ? d.pv.kwp : "-"} kWp · battery ${d.battery.include ? d.battery.kwh : "-"} kWh · wallbox ${d.wallbox.include ? "yes" : "no"}`);
    designs.push({ ...s, design });
  }
  writeFileSync(join(OUT, "deck_3d_designs.json"), JSON.stringify(designs, null, 2));

  const chrome = await launchChrome();
  const page = chrome.page;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  const gl = await evaluate(page, `(() => { const c = document.createElement("canvas").getContext("webgl2");
    const i = c && c.getExtension("WEBGL_debug_renderer_info"); return i ? c.getParameter(i.UNMASKED_RENDERER_WEBGL) : "none"; })()`);
  console.log(`WebGL: ${gl}`);

  const files = ["deck_3d_designs.json"];
  if (args.only !== "video") {
    const only = args.scenes ? String(args.scenes).split(",").map(Number) : null;
    for (const s of designs.filter((d) => !only || only.includes(d.n))) {
      for (const size of SIZES.filter((z) => !args.size || z.tag === args.size)) {
        const file = `deck_3d_${s.n}_${s.name}_${size.tag}${args.suffix ? `_${args.suffix}` : ""}.png`;
        await open(page, base, { design: s.design, home: s.home, clean: true }, size.w, size.h, SS);
        await setHour(page, HOUR);
        await sleep(6000); // sun eases in, contact shadows accumulate (200 frames)
        const raw = join(OUT, `.raw-${file}`);
        const shot = await page.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(raw, Buffer.from(shot.data, "base64"));
        ffmpeg(["-i", raw, "-vf", `scale=${size.w}:${size.h}:flags=lanczos`, join(OUT, file)]);
        rmSync(raw);
        files.push(file);
        console.log(`  ${file}`);
      }
    }
  }
  if (args.only !== "stills") {
    files.push(await record(page, base, designs.find((d) => d.name === "ev")));
  }
  chrome.close();

  if (args.upload) {
    execFileSync("gh", ["release", "upload", "data-v1", ...files.map((f) => join(OUT, f)), "--clobber"], { stdio: "inherit" });
    console.log(`uploaded ${files.length} files to data-v1`);
  }
}

/** 10–15 s of the day playing (06:00 → 22:00) with the planner's live panel, 1920×1080 H.264. */
async function record(page, base, scene) {
  const file = "deck_3d_day_16x9.mp4";
  await open(page, base, { design: scene.design, home: scene.home, mode: "planner" }, 1280, 720, 1.5);
  await setHour(page, 6);
  await sleep(3000);
  const dir = mkdtempSync(join(tmpdir(), "h3d-rec-"));
  const frames = [];
  const off = page.on((m) => {
    if (m.method !== "Page.screencastFrame") return;
    const { data, metadata, sessionId } = m.params;
    const f = join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(f, Buffer.from(data, "base64"));
    frames.push({ f, t: metadata.timestamp });
    void page.send("Page.screencastFrameAck", { sessionId });
  });
  await page.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1920, maxHeight: 1080 });
  await sleep(700);
  await evaluate(page, `document.querySelector('[aria-label="Play the day"]').click()`);
  await sleep(14600);
  await page.send("Page.stopScreencast");
  off();
  if (frames.length < 60) throw new Error(`only ${frames.length} frames captured`);
  // variable frame timing from Chrome → constant 30 fps
  const list = frames.map((fr, i) => `file '${fr.f}'\nduration ${((frames[i + 1]?.t ?? fr.t + 1 / 30) - fr.t).toFixed(4)}`).join("\n");
  writeFileSync(join(dir, "list.txt"), `${list}\nfile '${frames.at(-1).f}'\n`);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "fps=30,scale=1920:1080:flags=lanczos",
    "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(OUT, file)]);
  const secs = frames.at(-1).t - frames[0].t;
  console.log(`  ${file} (${frames.length} frames over ${secs.toFixed(1)} s, ≈ ${(frames.length / secs).toFixed(0)} fps captured)`);
  rmSync(dir, { recursive: true, force: true });
  return file;
}

async function open(page, base, shot, w, h, dpr) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: THEME }] });
  const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__H3D = ${JSON.stringify(shot)}; window.__h3dErrors = [];
      addEventListener("error", (e) => __h3dErrors.push(String(e.message)));
      addEventListener("unhandledrejection", (e) => __h3dErrors.push(String(e.reason)));`,
  });
  await page.send("Page.navigate", { url: `${base}/house3d-export` });
  try {
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      const ready = await evaluate(page, `!!document.querySelector('[data-h3d-stage] > img')?.classList.contains('opacity-0')`).catch(() => false);
      if (ready) return;
    }
    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, ".debug-not-ready.png"), Buffer.from(shot.data, "base64"));
    const errors = await evaluate(page, `JSON.stringify(window.__h3dErrors ?? [])`).catch(() => "[]");
    throw new Error(`the 3D scene never became ready; see ${join(OUT, ".debug-not-ready.png")}; page errors: ${errors}`);
  } finally {
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
  }
}

async function setHour(page, h) {
  await evaluate(page, `(() => {
    const el = document.querySelector('[data-h3d-ui] input[type=range]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '${h}');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function evaluate(page, expression) {
  const r = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

function ffmpeg(a) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });
}

async function startServer() {
  const page = join(WEB, "src/app/house3d-export/page.tsx");
  if (!existsSync(page)) {
    mkdirSync(dirname(page), { recursive: true });
    copyFileSync(join(WEB, "scripts/house/export-page.tsx"), page);
    cleanup.push(() => rmSync(dirname(page), { recursive: true, force: true }));
  }
  // a production build: `next dev` keeps reloading the page (Fast Refresh) and never lets the scene settle
  console.log("building (next build) …");
  execFileSync("npx", ["next", "build"], { cwd: WEB, stdio: "ignore" });
  const port = 3119;
  const dev = spawn("npx", ["next", "start", "-p", String(port)], { cwd: WEB, stdio: "ignore", detached: true });
  cleanup.push(() => { try { process.kill(-dev.pid); } catch {} });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    const ok = await fetch(`${base}/house3d-export`).then((r) => r.ok).catch(() => false);
    if (ok) return base;
  }
  throw new Error("next dev did not start");
}

async function launchChrome() {
  const port = 9339;
  const profile = mkdtempSync(join(tmpdir(), "h3d-chrome-"));
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "--force-color-profile=srgb",
    "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=metal", "--window-size=1920,1080", "about:blank",
  ], { stdio: "ignore" });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { proc.kill(); } catch {}
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  };
  cleanup.push(close);
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
  }
  if (!target) throw new Error("Chrome did not start");
  return { page: await connect(target.webSocketDebuggerUrl), close };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("DevTools connection failed")); });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pending.get(m.id);
    if (!p) return listeners.forEach((l) => l(m));
    pending.delete(m.id);
    if (m.error) p.rej(new Error(m.error.message));
    else p.res(m.result);
  };
  return {
    send: (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (f) => { listeners.add(f); return () => listeners.delete(f); },
  };
}

main()
  .catch((e) => { console.error(e.message ?? e); process.exitCode = 1; })
  .finally(() => { for (const c of cleanup.reverse()) c(); process.exit(); });

