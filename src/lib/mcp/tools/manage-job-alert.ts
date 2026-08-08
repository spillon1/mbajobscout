import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "manage_job_alert",
  title: "Manage daily job alert",
  description:
    "View or update the signed-in user's daily job alert email settings (keywords, location, enabled).",
  inputSchema: {
    operation: z.enum(["get", "update"]).default("get").describe("Read or update the alert config."),
    enabled: z.boolean().optional().describe("Turn the daily alert email on or off (update only)."),
    location: z.string().trim().optional().describe("Location filter for alerts (update only)."),
    keywords: z.array(z.string().trim().min(1)).optional().describe("Keyword list for alerts (update only)."),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ operation, enabled, location, keywords }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const user_id = ctx.getUserId();

    if (operation === "get") {
      const { data, error } = await supabase
        .from("job_alerts")
        .select("enabled, email, location, keywords, source_names, last_alerted_at")
        .eq("user_id", user_id)
        .maybeSingle();
      return error
        ? { content: [{ type: "text", text: error.message }], isError: true }
        : {
            content: [{ type: "text", text: JSON.stringify(data ?? { configured: false }, null, 2) }],
            structuredContent: { alert: data ?? null },
          };
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (enabled !== undefined) patch.enabled = enabled;
    if (location !== undefined) patch.location = location;
    if (keywords !== undefined) patch.keywords = keywords;

    if (Object.keys(patch).length === 1) {
      return { content: [{ type: "text", text: "Nothing to update." }], isError: true };
    }

    const { data, error } = await supabase
      .from("job_alerts")
      .update(patch)
      .eq("user_id", user_id)
      .select();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data?.length) {
      return {
        content: [{ type: "text", text: "No alert configured yet — set one up in the app first." }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data[0], null, 2) }],
      structuredContent: { alert: data[0] },
    };
  },
});
