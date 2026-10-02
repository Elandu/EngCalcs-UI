export type PreviewFailure = { message: string; status: number };

function detailMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim().slice(0, 500);
  // FastAPI request validation returns a list of {loc, msg} records.
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { loc?: unknown; msg?: unknown };
    const location = Array.isArray(first?.loc) ? first.loc.filter((part) => part !== "body").join(".") : "";
    if (typeof first?.msg === "string") return `${location ? `${location}: ` : ""}${first.msg}`.slice(0, 500);
  }
  return null;
}

/** Maps an engine response to a user-facing preview failure, or null when it succeeded. */
export function previewFailure(status: number, body: unknown): PreviewFailure | null {
  if (status >= 200 && status < 300) {
    return body && typeof body === "object" && !Array.isArray(body)
      ? null
      : { message: "The calculation engine returned an unrecognised result.", status: 502 };
  }
  if (status === 401 || status === 403) {
    return { message: "Your session cannot run calculations. Sign in again.", status };
  }
  if (status === 404) {
    return { message: "This calculation is not installed in the connected engine yet.", status: 404 };
  }
  if (status === 422 || status === 400) {
    return { message: detailMessage(body) ?? "The engine rejected these inputs.", status: 422 };
  }
  return { message: "The calculation engine is unavailable. Try again or use Run and save.", status: 502 };
}
