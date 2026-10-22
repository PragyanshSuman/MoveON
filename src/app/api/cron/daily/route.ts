// Point a scheduler (Vercel Cron, GitHub Actions, cron-job.org) at this endpoint once a day.
import { runDailyJobs } from "@/lib/services/selling";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await runDailyJobs());
}
