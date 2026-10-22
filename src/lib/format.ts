// Display helpers shared by server and client components.
export { inr } from "./pricing";

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  const d = new Date(date.length === 10 ? `${date}T00:00:00+05:30` : date);
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", ...opts });
}

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function leavingLabel(daysLeft: number): string {
  if (daysLeft < 0) return "Sale ended";
  if (daysLeft === 0) return "Leaving today";
  if (daysLeft === 1) return "Leaving tomorrow";
  return `Leaving in ${daysLeft} days`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
