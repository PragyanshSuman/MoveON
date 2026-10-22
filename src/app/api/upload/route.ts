import { currentUser } from "@/lib/auth";
import { readImage, saveImage } from "@/lib/uploads";

export async function POST(req: Request) {
  if (!(await currentUser())) return Response.json({ error: "Please log in." }, { status: 401 });
  try {
    const { buf, ext } = await readImage((await req.formData()).get("file"));
    return Response.json({ url: saveImage(buf, ext) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Upload failed." }, { status: 400 });
  }
}
