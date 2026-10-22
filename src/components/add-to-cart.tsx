"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { addToCart, type ActionState } from "@/app/actions";

function Button({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={className}>{pending ? "Adding…" : label}</button>;
}

export function AddToCart({ itemIds, inCart, label = "Add to cart", className = "btn-arrive w-full" }: { itemIds: string[]; inCart?: boolean; label?: string; className?: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addToCart, null);
  if (inCart || state?.ok) {
    return <Link href="/cart" className={className.replace(/btn-\w+/, "btn-ghost")}>In cart · View cart →</Link>;
  }
  return (
    <form action={action}>
      {itemIds.map((id) => <input key={id} type="hidden" name="itemId" value={id} />)}
      <Button label={label} className={className} />
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
