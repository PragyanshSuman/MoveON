"use client";
import { useActionState } from "react";
import { emailBadgeConfirm, emailBadgeStart, type ActionState } from "@/app/actions";
import { Submit } from "./action-form";

export function EmailBadgeForm() {
  const [started, start] = useActionState<ActionState, FormData>(emailBadgeStart, null);
  const [confirmed, confirm] = useActionState<ActionState, FormData>(emailBadgeConfirm, null);
  const email = (confirmed?.email ?? started?.email) as string | undefined;

  if (confirmed?.ok) return <p role="status" className="rounded-xl bg-ok/10 p-3 text-sm font-semibold text-ok">{confirmed.ok}</p>;

  if (started?.step !== "code") {
    return (
      <form action={start} className="space-y-3">
        <label className="label" htmlFor="email">College or work email</label>
        <input id="email" name="email" type="email" required placeholder="you@college.ac.in or you@company.com" className="input" />
        <Submit className="btn-arrive w-full" pendingText="Sending…">Send verification code</Submit>
        {started?.error && <p role="alert" className="text-sm text-danger">{started.error}</p>}
      </form>
    );
  }

  return (
    <form action={confirm} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      <p className="text-sm text-ink-soft">Code sent to <strong className="text-ink">{email}</strong>.</p>
      {typeof started.devCode === "string" && (
        <p className="rounded-xl bg-tape/30 p-3 text-sm"><strong>Demo mode:</strong> email isn&apos;t configured; your code is <code className="font-bold">{started.devCode}</code></p>
      )}
      <input name="code" inputMode="numeric" maxLength={6} required placeholder="6-digit code" className="input text-center tracking-[0.4em]" />
      <Submit className="btn-arrive w-full" pendingText="Verifying…">Verify</Submit>
      {confirmed?.error && <p role="alert" className="text-sm text-danger">{confirmed.error}</p>}
    </form>
  );
}
