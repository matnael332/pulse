// The engine: the product's own Python in a worker of the browser (worker.ts). One at a time, loaded
// ahead while the visitor reads, and ended after each run so its memory goes back.
//
// The worker starts from a blob of this page, not from its own address: that way it inherits the
// page's Content-Security-Policy, and the browser itself refuses any request it would send elsewhere.
import workerUrl from "./worker?worker&url";

export type Refusal = { ok: false; code: string; params: Record<string, unknown> };
export type Facts = Record<string, number | string | null>;

/** Loading Python: the bytes so far and in total (nothing to show once it is there). */
export interface Loading {
  loaded: number;
  total: number;
}

export interface Listener {
  onLoading: (loading: Loading | null) => void;
  onTell: (stage: string, facts: Facts) => void;
}

export interface Engine {
  /** Give the worker the export, then call one of the runner's methods. */
  put: (file: ArrayBuffer) => Promise<void>;
  call: <T>(method: string, args?: unknown[]) => Promise<T>;
  stop: () => void;
}

export type FromWorker =
  | { kind: "loading"; loading: Loading | null }
  | { kind: "tell"; stage: string; facts: Facts }
  | { kind: "answer"; id: number; value: unknown }
  | { kind: "failed"; id: number; message: string };

export function createEngine(listener: Listener): Engine {
  const source = `import ${JSON.stringify(new URL(workerUrl, location.href).href)};`;
  const blob = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(blob, { type: "module" });
  const waiting = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>();
  let next = 1;

  worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
    if (data.kind === "loading") listener.onLoading(data.loading);
    else if (data.kind === "tell") listener.onTell(data.stage, data.facts);
    else {
      const call = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.kind === "answer") call?.resolve(data.value as never);
      else call?.reject(new Error(data.message));
    }
  };
  worker.onerror = (event) => {
    for (const call of waiting.values()) call.reject(new Error(event.message || "worker"));
    waiting.clear();
  };

  function ask<T>(message: object, transfer: Transferable[] = []): Promise<T> {
    const id = next++;
    return new Promise<T>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, ...message }, transfer);
    });
  }

  void ask({ kind: "load", base: new URL(import.meta.env.BASE_URL, location.href).href }).catch(
    () => undefined, // the next call fails with the same reason, and says so
  );

  return {
    put: (file) => ask<void>({ kind: "put", file }, [file]),
    call: <T>(method: string, args: unknown[] = []) => ask<T>({ kind: "call", method, args }),
    stop() {
      worker.terminate();
      URL.revokeObjectURL(blob);
      for (const call of waiting.values()) call.reject(new Error("stopped"));
      waiting.clear();
    },
  };
}
