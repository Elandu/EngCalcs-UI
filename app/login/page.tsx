import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { safeAuthRedirectPath } from "@/lib/safe-auth-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const confirmationFailed = query.confirmation === "failed";
  const next = Array.isArray(query.next) ? query.next[0] : query.next;
  const redirectTo = safeAuthRedirectPath(next ?? null);

  return (
    <main className="auth-shell">
      <div className="auth-top">
        <Brand />
        <Link href="/">Back to home</Link>
      </div>
      <section className="auth-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to EngCalcs</h1>
        <p>Open your projects, calculations and review history.</p>
        <AuthForm mode="login" confirmationFailed={confirmationFailed} redirectTo={redirectTo} />
      </section>
    </main>
  );
}
