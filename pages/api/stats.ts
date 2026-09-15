import type { NextApiRequest, NextApiResponse } from "next";
import { getDailyStats, type DailyStats } from "@/lib/stats";

type ResponseData = DailyStats | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  if (!date) {
    res.status(400).json({ error: "The date query parameter is required" });
    return;
  }

  try {
    res.status(200).json(await getDailyStats(date));
  } catch (error) {
    console.error("[stats] failed:", error);
    res.status(500).json({ error: "Unable to load stats" });
  }
}
