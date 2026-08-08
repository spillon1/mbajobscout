import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tracked_jobs",
  title: "List tracked jobs",
  description:
    "List jobs the signed-in user has saved, applied to, or marked as not interested.",
  inputSchema: {
    action: z
      .enum(["saved", "applied", "not_interested"])
      .optional()
      .describe("Filter to one tracking status. Omit to return all."),
    limit: z.number().int().min(1).max(100).default(50).describe("Maximum rows to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ action, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("job_actions")
      .select("action, job_title, job_company, job_source, job_url, created_at")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (action) q = q.eq("action", action);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { count: data?.length ?? 0, items: data ?? [] },
    };
  },
});
