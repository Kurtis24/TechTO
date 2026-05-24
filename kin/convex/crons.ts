/**
 * Scheduled jobs.
 *
 *   morningBriefing — daily at 12:00 UTC = 8:00 AM in Toronto during EDT
 *                     (Mar–Nov). During EST (Nov–Mar), this fires at 7:00 AM
 *                     locally — acceptable hackathon drift; the proper fix is
 *                     to move scheduling per-subscriber tz.
 */

import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "morning briefing",
  { hourUTC: 12, minuteUTC: 0 },
  api.briefing.morningBriefing,
);

export default crons;
