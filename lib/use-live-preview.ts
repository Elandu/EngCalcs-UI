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

  useEffect(() => {
    if (!enabled || !key) return;
    const controller = new AbortController();
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
    };
    // `parse` is expected to be a stable module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculationId, delayMs, enabled, key]);

  if (!enabled) return { ...IDLE, current: false };
  return { ...state, current: state.status === "ready" && state.inputsKey === key };
}
