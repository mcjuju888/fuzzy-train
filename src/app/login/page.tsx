import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in — Gambit File" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card p-8">
        <p className="field-label">Access control</p>
        <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-paper-ink">
          Sign in
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-paper-muted">
          We send a one-time link to your email — no password to remember. Signing in lets you keep
          a roster of opponents instead of retyping usernames.
        </p>

        <div className="perforation my-6" />

        <LoginForm nextPath={next ?? null} initialError={error ?? null} />
      </div>
    </div>
  );
}
