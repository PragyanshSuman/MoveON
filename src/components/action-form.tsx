"use client";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** A form bound to a server action that shows the action's error/ok message inline. */
export function ActionForm({ action, children, className, quiet }: { action: Action; children: ReactNode; className?: string; quiet?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <ActionMessage state={state} quiet={quiet} />
    </form>
  );
}

export function ActionMessage({ state, quiet }: { state: ActionState; quiet?: boolean }) {
  if (state?.error) return <p role="alert" className="mt-2 text-sm font-medium text-danger">{state.error}</p>;
  if (state?.ok && !quiet) return <p role="status" className="mt-2 text-sm font-medium text-ok">{state.ok}</p>;
  return null;
}

export function Submit({ children, className = "btn-primary", pendingText, confirm, name, value }: {
  children: ReactNode; className?: string; pendingText?: string; confirm?: string; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={className}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}
