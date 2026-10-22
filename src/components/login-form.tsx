"use client";
import { useActionState, useState } from "react";
import { requestLoginOtp, verifyLoginOtp, type ActionState } from "@/app/actions";
import { Submit } from "./action-form";

export function LoginForm({ next, referral }: { next: string; referral?: string }) {
  const [attempt, setAttempt] = useState(0);
  return <Steps key={attempt} next={next} referral={referral} onRestart={() => setAttempt((a) => a + 1)} />;
}

function Steps({ next, referral, onRestart }: { next: string; referral?: string; onRestart: () => void }) {
  const [sent, send] = useActionState<ActionState, FormData>(requestLoginOtp, null);
  const [checked, check] = useActionState<ActionState, FormData>(verifyLoginOtp, null);
  const verifying = sent?.step === "verify";
  const needsName = Boolean(checked?.needsName ?? sent?.needsName);

  if (!verifying) {
    return (
      <form action={send} className="space-y-4">
        <div>
          <label htmlFor="phone" className="label">Mobile number</label>
          <div className="flex">
            <span className="grid place-items-center rounded-l-xl border border-r-0 border-line bg-kraft-soft px-3 text-sm font-semibold">+91</span>
            <input id="phone" name="phone" inputMode="numeric" autoComplete="tel-national" required placeholder="98765 43210" className="input rounded-l-none" />
          </div>
        </div>
        <Submit className="btn-primary w-full" pendingText="Sending code…">Send OTP</Submit>
        {sent?.error && <p role="alert" className="text-sm text-danger">{sent.error}</p>}
      </form>
    );
  }

  return (
    <form action={check} className="space-y-4">
      <input type="hidden" name="phone" value={String(sent.phone)} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="needsName" value={needsName ? "1" : "0"} />
      {referral && <input type="hidden" name="ref" value={referral} />}
      <p className="text-sm text-ink-soft">
        We sent a 6-digit code to <strong className="text-ink">{String(sent.phone)}</strong>.{" "}
        <button type="button" onClick={onRestart} className="font-semibold underline">Change</button>
      </p>
      {typeof sent.devCode === "string" && (
        <p className="rounded-xl bg-tape/30 p-3 text-sm">
          <strong>Demo mode:</strong> no SMS gateway is configured, so here&apos;s your code: <code className="font-bold tracking-widest">{sent.devCode}</code>
        </p>
      )}
      <div>
        <label htmlFor="code" className="label">OTP</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="input text-center text-lg tracking-[0.5em]" />
      </div>
      {needsName && (
        <div>
          <label htmlFor="name" className="label">Your name</label>
          <input id="name" name="name" required autoComplete="name" placeholder="First and last name" className="input" />
          <p className="mt-1 text-xs text-ink-soft">Buyers and sellers only see your first name and last initial.</p>
        </div>
      )}
      <Submit className="btn-primary w-full" pendingText="Verifying…">Verify &amp; continue</Submit>
      {checked?.error && <p role="alert" className="text-sm text-danger">{checked.error}</p>}
    </form>
  );
}
