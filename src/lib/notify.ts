// Outbound messaging. In-app notifications are written inside the data transaction;
// WhatsApp/SMS are sent afterwards so a failed transaction never sends anything.
import type { DB } from "./types";

type Outbound = { phone: string; text: string; link?: string };

export class Outbox {
  private queue: Outbound[] = [];

  /** Adds an in-app notification and queues a WhatsApp message for the user. */
  notify(db: DB, userId: string, text: string, link?: string) {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    db.notifications.push({
      id: `n_${Math.random().toString(36).slice(2, 12)}`,
      userId, text, link, read: false, createdAt: new Date().toISOString(),
    });
    this.queue.push({ phone: user.phone, text, link });
  }

  async flush() {
    const items = this.queue.splice(0);
    await Promise.allSettled(items.map((m) => sendWhatsApp(m.phone, m.link ? `${m.text} ${absoluteUrl(m.link)}` : m.text)));
  }
}

export function absoluteUrl(pathname: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${pathname}`;
}

/**
 * WhatsApp Business Cloud API. Business-initiated messages must use an approved template;
 * we use one template with a single body variable carrying the text.
 */
export async function sendWhatsApp(phone: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    if (process.env.NODE_ENV !== "test") console.info(`[whatsapp:dev] to ${phone}: ${text}`);
    return;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/^\+/, ""),
        type: "template",
        template: {
          name: process.env.WHATSAPP_TEMPLATE ?? "moveon_update",
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 1000) }] }],
        },
      }),
    });
    if (!res.ok) console.error(`[whatsapp] ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.error("[whatsapp] send failed", err);
  }
}

/** SMS for login OTPs. Point SMS_WEBHOOK_URL at your SMS gateway adapter (MSG91, Twilio, etc.). */
export async function sendSms(phone: string, text: string): Promise<void> {
  const hook = process.env.SMS_WEBHOOK_URL;
  if (!hook) {
    if (process.env.NODE_ENV !== "test") console.info(`[sms:dev] to ${phone}: ${text}`);
    return;
  }
  const res = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({ to: phone, text }),
  });
  if (!res.ok) throw new Error(`SMS gateway returned ${res.status}`);
}
