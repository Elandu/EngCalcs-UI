import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { safeAuthRedirectPath } from "@/lib/safe-auth-redirect";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const next = Array.isArray(query.next) ? query.next[0] : query.next;
  const redirectTo = safeAuthRedirectPath(next ?? null);

  return (
    <main className="auth-shell">
      <div className="auth-top">
        <Brand />
        <Link href="/">Back to home</Link>
      </div>
      <section className="auth-card">
        <p className="eyebrow">Early access</p>
        <h1>Create your engineering workspace</h1>
        <p>Start with a private workspace for projects and transparent calculations.</p>
        <AuthForm mode="signup" redirectTo={redirectTo} />
      </section>
    </main>
  );
}
