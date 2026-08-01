import { ScoutForm } from "@/components/scout-form";

export const metadata = { title: "New scout — Gambit File" };

export default function ScoutPage() {
  return (
    <div className="mx-auto max-w-xl py-6">
      <div className="card p-8">
        <p className="field-label">Open a file</p>
        <h1 className="mt-2 font-mono text-2xl font-bold text-paper-ink">Scout a player</h1>
        <p className="mt-3 text-sm leading-relaxed text-paper-muted">
          Enter a public Chess.com or Lichess username. The first look pulls their recent history
          server-side and caches it, so opening the same file again is instant.
        </p>

        <div className="perforation my-6" />

        <ScoutForm />
      </div>
    </div>
  );
}
