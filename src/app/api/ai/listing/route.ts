// Photo → listing drafts. Returns { available: false } when no AI key is configured so the
// client can fall back to manual entry with rule-based price suggestions.
import { currentUser } from "@/lib/auth";
import { aiAvailable, analyzeRoomPhoto, describeAiError } from "@/lib/ai";
import { readImage } from "@/lib/uploads";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await currentUser())) return Response.json({ error: "Please log in." }, { status: 401 });
  if (!aiAvailable()) return Response.json({ available: false });
  try {
    const form = await req.formData();
    const { buf, mediaType } = await readImage(form.get("image"));
    const result = await analyzeRoomPhoto({ data: buf.toString("base64"), mediaType }, String(form.get("hint") ?? ""));
    return Response.json({ available: true, ...result });
  } catch (err) {
    console.error("[ai/listing]", err);
    return Response.json({ available: true, error: describeAiError(err) }, { status: 502 });
  }
}
