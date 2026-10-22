// Photo walk-through: Claude looks at a room photo, finds each sellable item, and drafts a
// listing for it. Prices are blended with the rule-based engine so one bad guess can't
// produce an absurd price.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CATEGORIES } from "./catalog";
import { roundTo, suggestPrice } from "./pricing";
import type { Condition } from "./types";

const MODEL = process.env.MOVEON_AI_MODEL ?? "claude-opus-5-5";

const categoryIds = CATEGORIES.map((c) => c.id) as [string, ...string[]];

const DetectedItem = z.object({
  title: z.string().describe("Short marketplace title, e.g. 'Wakefit queen bed with storage'"),
  category: z.enum(categoryIds),
  brand: z.string().nullable().describe("Brand if visible or obvious, else null"),
  condition: z.enum(["like_new", "good", "fair", "worn"]),
  age_months_estimate: z.number().int(),
  estimated_new_price_inr: z.number().int().describe("Typical price of this item new in India today"),
  suggested_price_inr: z.number().int().describe("Fair asking price on the Indian used market"),
  description: z.string().describe("One or two factual sentences a buyer would want: size, material, visible wear"),
  bbox: z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }).describe("Bounding box, fractions 0-1 of image width/height"),
});

const PhotoAnalysis = z.object({
  items: z.array(DetectedItem),
  notes: z.string().describe("Anything the seller should know, e.g. items that looked like landlord fixtures and were skipped"),
});

const SYSTEM = `You catalogue household items from photos for MoveOn, a marketplace in Bengaluru where people leaving the city sell everything in their room before a deadline.

For each separate item someone could sell, return one entry. Include furniture, mattresses, appliances, electronics, kitchen sets, cycles, books and decor. Skip people, pets, documents, clothes, toiletries, and fixtures that normally belong to the landlord (built-in wardrobes, ceiling fans, geysers, wall lights). Never list weapons, medicines, alcohol or gas cylinders.

Judge condition only from what is visible. Prices are in Indian rupees for the Bengaluru used market, where buyers expect roughly 40-60% of the new price for items in good condition. Pick the closest category; use "other" only when nothing fits.`;

export interface ListingDraft {
  title: string;
  category: string;
  brand?: string;
  condition: Condition;
  ageMonths: number;
  description: string;
  listPrice: number;
  floorPrice: number;
  originalPrice?: number;
  priceReasoning: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

export function aiAvailable(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | undefined;

export async function analyzeRoomPhoto(
  image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" },
  sellerHint?: string,
): Promise<{ drafts: ListingDraft[]; notes: string }> {
  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // A single extraction pass: low effort keeps the walk-through fast on a phone.
    output_config: { effort: "low", format: betaZodOutputFormat(PhotoAnalysis) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: sellerHint?.trim() ? `Seller's note about these items: ${sellerHint.trim().slice(0, 500)}` : "List the items in this photo." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The photo couldn't be analysed. Try another photo or add items manually.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Couldn't read items from this photo. Try a brighter, wider shot.");

  const drafts = parsed.items.slice(0, 25).map((it): ListingDraft => {
    const condition = it.condition as Condition;
    const ageMonths = Math.max(0, Math.min(240, it.age_months_estimate));
    const rules = suggestPrice({
      category: it.category, ageMonths, condition, brand: it.brand ?? undefined,
      originalPrice: it.estimated_new_price_inr > 0 ? it.estimated_new_price_inr : undefined,
    });
    // Blend the model's market guess with the rule-based price, but never stray far from the rules.
    const ai = it.suggested_price_inr > 0 ? it.suggested_price_inr : rules.listPrice;
    const blended = Math.min(rules.listPrice * 1.5, Math.max(rules.listPrice * 0.6, (ai + rules.listPrice) / 2));
    const listPrice = roundTo(blended, 50);
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const bbox = { x0: clamp(Math.min(it.bbox.x0, it.bbox.x1)), y0: clamp(Math.min(it.bbox.y0, it.bbox.y1)), x1: clamp(Math.max(it.bbox.x0, it.bbox.x1)), y1: clamp(Math.max(it.bbox.y0, it.bbox.y1)) };
    return {
      title: it.title.slice(0, 80), category: it.category, brand: it.brand ?? undefined, condition, ageMonths,
      description: it.description.slice(0, 500), listPrice, floorPrice: roundTo(listPrice * 0.6, 50),
      originalPrice: rules.estimatedNewPrice, priceReasoning: `AI market estimate ₹${ai.toLocaleString("en-IN")}, blended with: ${rules.reasoning}`,
      bbox: bbox.x1 - bbox.x0 > 0.05 && bbox.y1 - bbox.y0 > 0.05 ? bbox : undefined,
    };
  });
  return { drafts, notes: parsed.notes };
}

export function describeAiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "AI listing isn't configured correctly (invalid API key).";
  if (err instanceof Anthropic.RateLimitError) return "AI listing is busy right now. Try again in a minute, or add items manually.";
  if (err instanceof Anthropic.BadRequestError) return "That photo couldn't be processed. Try a JPEG or PNG under 5 MB.";
  if (err instanceof Anthropic.APIError) return "AI listing is temporarily unavailable. Add items manually for now.";
  if (err instanceof Error) return err.message;
  return "Something went wrong analysing the photo.";
}
