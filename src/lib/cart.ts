// The cart lives in a cookie so people can browse and collect items before logging in.
import { cookies } from "next/headers";

const CART_COOKIE = "moveon_cart";
const MAX_ITEMS = 40;

export async function getCart(): Promise<string[]> {
  const raw = (await cookies()).get(CART_COOKIE)?.value ?? "";
  return raw.split(",").filter((id) => /^i_[a-z0-9]+$/.test(id)).slice(0, MAX_ITEMS);
}

export async function setCart(ids: string[]) {
  (await cookies()).set(CART_COOKIE, [...new Set(ids)].slice(0, MAX_ITEMS).join(","), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 14 * 86_400, secure: process.env.NODE_ENV === "production",
  });
}
