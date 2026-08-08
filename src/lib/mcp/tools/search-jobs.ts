import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const MODES = ["vc", "pe", "ib", "mc", "st", "im", "tech", "startups"] as const;

export default defineTool({
  name: "search_jobs",
  title: "Search jobs",
  description:
    "Search the MBAJOBSCOUT UK job database by career mode (vc, pe, ib, mc, st, im, tech, startups), keyword and location.",
  inputSchema: {
    mode: z.enum(MODES).default("vc").describe("Career category to search."),
    query: z.string().trim().optional().describe("Keyword matched against job title and company."),
    location: z.string().trim().optional().describe("Location filter, e.g. 'London' or 'Remote'."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of jobs to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ mode, query, location, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("scraped_jobs")
      .select("title, company, location, salary, source, url, posted_date, scraped_at")
      .eq("mode", mode)
      .order("scraped_at", { ascending: false })
      .limit(limit);

    if (query) q = q.or(`title.ilike.%${query}%,company.ilike.%${query}%`);
    if (location) q = q.ilike("location", `%${location}%`);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { count: data?.length ?? 0, jobs: data ?? [] },
    };
  },
});
