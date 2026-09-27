"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authPageHref } from "@/lib/safe-auth-redirect";

type Mode = "login" | "signup";

export function AuthForm({
  mode,
  confirmationFailed = false,
  redirectTo,
}: {
  mode: Mode;
  confirmationFailed?: boolean;
  redirectTo: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(
    confirmationFailed
      ? "That confirmation link could not be used. Sign in if your account is already confirmed, or sign up to request a fresh link."
      : "",
  );
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    setBusy(true);
    const supabase = createClient();

    const confirmationUrl = new URL("/auth/confirm", window.location.origin);
    confirmationUrl.searchParams.set("next", redirectTo);

    const result = isSignup
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: confirmationUrl.toString(),
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (isSignup && !result.data.session) {
      setMessage("Check your email to confirm your account.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        Work email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@engineering.com.au"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>
      <button className="button button-primary auth-submit" type="submit" disabled={busy}>
        {busy ? "Working…" : isSignup ? "Create workspace" : "Sign in"}
      </button>
      {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
      <p className="auth-switch">
        {isSignup ? "Already have an account?" : "New to OpenCalcs?"}{" "}
        <Link href={authPageHref(isSignup ? "login" : "signup", redirectTo)}>
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
