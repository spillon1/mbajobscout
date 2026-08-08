import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchJobsTool from "./tools/search-jobs";
import listTrackedJobsTool from "./tools/list-tracked-jobs";
import trackJobTool from "./tools/track-job";
import untrackJobTool from "./tools/untrack-job";
import manageJobAlertTool from "./tools/manage-job-alert";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mbajobscout",
  title: "MBAJOBSCOUT",
  version: "0.1.0",
  instructions:
    "Tools for MBAJOBSCOUT, a UK job aggregator across VC, PE, IB, consulting, S&T, investment management, tech and startups. Use `search_jobs` to find roles, `track_job` / `untrack_job` to manage the user's saved, applied and dismissed jobs, `list_tracked_jobs` to review them, and `manage_job_alert` for daily alert email settings.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchJobsTool, listTrackedJobsTool, trackJobTool, untrackJobTool, manageJobAlertTool],
});
