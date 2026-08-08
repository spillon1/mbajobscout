import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "untrack_job",
  title: "Untrack a job",
  description: "Remove a job's saved / applied / not-interested status for the signed-in user.",
  inputSchema: {
    job_url: z.string().url().describe("Canonical URL of the job listing to untrack."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ job_url }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("job_actions")
      .delete()
      .eq("user_id", ctx.getUserId())
      .eq("job_url", job_url)
      .select();

    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: `Removed ${data?.length ?? 0} tracking record(s).` }],
          structuredContent: { removed: data?.length ?? 0 },
        };
  },
});
