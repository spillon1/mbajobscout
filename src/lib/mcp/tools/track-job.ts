import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "track_job",
  title: "Track a job",
  description:
    "Save a job, mark it as applied, or mark it as not interested for the signed-in user.",
  inputSchema: {
    job_url: z.string().url().describe("Canonical URL of the job listing."),
    job_title: z.string().trim().min(1).describe("Job title."),
    job_company: z.string().trim().min(1).describe("Hiring company."),
    job_source: z.string().trim().default("MCP").describe("Where the job was found."),
    action: z
      .enum(["saved", "applied", "not_interested"])
      .describe("Tracking status to record for this job."),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ job_url, job_title, job_company, job_source, action }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const user_id = ctx.getUserId();

    await supabase.from("job_actions").delete().eq("user_id", user_id).eq("job_url", job_url);

    const { data, error } = await supabase
      .from("job_actions")
      .insert({ user_id, job_url, job_title, job_company, job_source, action })
      .select();

    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: `Marked "${job_title}" as ${action}.` }],
          structuredContent: { row: data?.[0] },
        };
  },
});
