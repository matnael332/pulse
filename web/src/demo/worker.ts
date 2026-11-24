// Python in the browser, off the page's thread: Pyodide and the packages from the demo's own address
// (py/, packed by pulse_demo.pack), then the runner, one call at a time.
import type { FromWorker, Loading } from "./engine";

interface Pyodide {
  FS: { writeFile: (path: string, data: Uint8Array) => void };
  globals: { get: (name: string) => unknown; set: (name: string, value: unknown) => void };
  loadPackage: (names: string[], options: object) => Promise<unknown>;
  unpackArchive: (body: ArrayBuffer, format: string, options: object) => void;
  runPython: (code: string) => unknown;
}

type ToWorker = { id: number } & (
  | { kind: "load"; base: string }
  | { kind: "put"; file: ArrayBuffer }
  | { kind: "call"; method: string; args: unknown[] }
);

const PACKAGES = ["numpy", "pandas", "scikit-learn", "pydantic", "charset-normalizer"];
const EXPORT = "/export.zip";
const START = `
import json, sys
sys.path.insert(0, "/pulse")
from pulse_demo.runner import Demo, call
demo = Demo("/work", lambda stage, facts: tell(stage, json.dumps(facts)))
`;

const say = (message: FromWorker) => postMessage(message);
let ready: Promise<Pyodide> | null = null;

/** Every file once, ahead of Pyodide's own requests (they then come from the browser's cache),
 * so the page can show how much is left. */
async function fetchAll(base: string) {
  const files: { name: string; bytes: number }[] = await (
    await fetch(`${base}py/files.json`)
  ).json();
  const loading: Loading = { loaded: 0, total: files.reduce((sum, f) => sum + f.bytes, 0) };
  say({ kind: "loading", loading: { ...loading } });
  await Promise.all(
    files.map(async ({ name, bytes }) => {
      const answer = await fetch(`${base}py/${name}`);
      if (!answer.ok || !answer.body) throw new Error(`${name}: ${answer.status}`);
      const reader = answer.body.getReader();
      let seen = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        seen += value.length;
        loading.loaded += value.length;
        say({ kind: "loading", loading: { ...loading } });
      }
      loading.loaded += bytes - seen;
    }),
  );
}

async function load(base: string): Promise<Pyodide> {
  await fetchAll(base);
  const { loadPyodide } = await import(/* @vite-ignore */ `${base}py/pyodide.mjs`);
  const py: Pyodide = await loadPyodide({ indexURL: `${base}py/` });
  await py.loadPackage(PACKAGES, { messageCallback: () => undefined });
  const ours = await (await fetch(`${base}py/pulse.zip`)).arrayBuffer();
  py.unpackArchive(ours, "zip", { extractDir: "/pulse" });
  py.globals.set("tell", (stage: string, facts: string) =>
    say({ kind: "tell", stage, facts: JSON.parse(facts) }),
  );
  py.runPython(START);
  say({ kind: "loading", loading: null });
  return py;
}

async function answer(message: ToWorker): Promise<unknown> {
  if (message.kind === "load") {
    ready = load(message.base);
    await ready;
    return undefined;
  }
  const py = await ready!;
  if (message.kind === "put") {
    py.FS.writeFile(EXPORT, new Uint8Array(message.file));
    return undefined;
  }
  const call = py.globals.get("call") as (demo: unknown, method: string, args: string) => string;
  const args = message.method === "propose" ? [EXPORT] : message.args;
  return JSON.parse(call(py.globals.get("demo"), message.method, JSON.stringify(args)));
}

onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  try {
    say({ kind: "answer", id: data.id, value: await answer(data) });
  } catch (error) {
    say({ kind: "failed", id: data.id, message: String(error).slice(-600) });
  }
};
