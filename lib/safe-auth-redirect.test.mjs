import assert from "node:assert/strict";
import test from "node:test";

import { authPageHref, safeAuthRedirectUrl } from "./safe-auth-redirect.ts";

const requestUrl = "https://engcalcs.example/auth/confirm?token_hash=redacted";
const fallback = "https://engcalcs.example/dashboard";

test("keeps same-origin app destinations", () => {
  assert.equal(
    safeAuthRedirectUrl("/dashboard/calculations?category=wind", requestUrl).href,
    "https://engcalcs.example/dashboard/calculations?category=wind",
  );
});

test("preserves protected destinations in sign-in URLs", () => {
  const loginUrl = new URL(
    authPageHref("login", "/dashboard/calculations?category=wind"),
    requestUrl,
  );
  assert.equal(loginUrl.pathname, "/login");
  assert.equal(
    loginUrl.searchParams.get("next"),
    "/dashboard/calculations?category=wind",
  );
});

test("falls back for external and protocol-relative destinations", () => {
  assert.equal(safeAuthRedirectUrl("https://outside.example", requestUrl).href, fallback);
  assert.equal(safeAuthRedirectUrl("//outside.example", requestUrl).href, fallback);
});

test("falls back for malformed, script, and credential-bearing destinations", () => {
  assert.equal(safeAuthRedirectUrl("http://[", requestUrl).href, fallback);
  assert.equal(safeAuthRedirectUrl("javascript:alert(1)", requestUrl).href, fallback);
  assert.equal(
    safeAuthRedirectUrl("https://user@engcalcs.example/dashboard", requestUrl).href,
    fallback,
  );
});
