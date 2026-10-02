"use client";

import { useEffect, useState } from "react";

export type LivePreviewState<T> = {
  status: "idle" | "pending" | "ready" | "error";
  result: T | null;
  error: string;
  /** The serialized inputs that produced `result`, so callers can tell when it is current. */
  inputsKey: string;
};

export type LivePreview<T> = LivePreviewState<T> & {
  /** True when `result` was computed from the inputs currently on screen. */
  current: boolean;
};

const IDLE = { status: "idle", result: null, error: "", inputsKey: "" } as const;

/**
 * Debounced, cancellable engine preview. Each change to `inputs` aborts the request in
 * flight, so a slow response can never overwrite the result of a newer model. Nothing is
 * saved; callers must still use the run route for project records.
 */
export function useLivePreview<T>(
  calculationId: string,
  inputs: unknown,
  { enabled, delayMs = 450, parse }: { enabled: boolean; delayMs?: number; parse: (value: unknown) => T | null },
): LivePreview<T> {
  const key = inputs === null || inputs === undefined ? "" : JSON.stringify(inputs);
  const [state, setState] = useState<LivePreviewState<T>>(IDLE);
  // Bumped to re-run the same inputs after the server asks the client to back off.
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!enabled || !key) return;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    const timer = window.setTimeout(async () => {
      setState((current) => ({ ...current, status: "pending", error: "" }));
      try {
        const response = await fetch(`/api/calculations/${encodeURIComponent(calculationId)}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: `{"inputs":${key}}`,
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 429) {
          const seconds = Number(payload.retryAfterSeconds ?? response.headers.get("Retry-After"));
          const waitMs = Math.min(Math.max(Number.isFinite(seconds) ? seconds * 1000 : 2000, 500), 60_000);
          retryTimer = window.setTimeout(() => setRetryToken((token) => token + 1), waitMs);
        }
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Live preview failed.");
        const parsed = parse(payload.result);
        if (!parsed) throw new Error("The engine returned an unrecognised preview result.");
        setState({ status: "ready", result: parsed, error: "", inputsKey: key });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          status: "error",
          error: error instanceof Error ? error.message : "Live preview failed.",
        }));
      }
    }, delayMs);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.clearTimeout(retryTimer);
    };
    // `parse` is expected to be a stable module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculationId, delayMs, enabled, key, retryToken]);

  if (!enabled) return { ...IDLE, current: false };
  return { ...state, current: state.status === "ready" && state.inputsKey === key };
}
