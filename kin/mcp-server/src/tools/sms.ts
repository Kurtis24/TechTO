import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { invokeKinTool, jsonResult } from "../invoke.js";

const planStepSchema = z.object({
  tool: z.string(),
  args: z.record(z.unknown()),
  reason: z.string().optional(),
});

export function registerSmsTools(server: McpServer): void {
  server.registerTool(
    "kin_route_inbound_sms",
    {
      description:
        "Dry-run: Backboard LLM chooses which Convex tools to run for an inbound SMS (no side effects).",
      inputSchema: z.object({
        from: z.string().describe("E.164 sender phone"),
        body: z.string().describe("SMS body text"),
      }),
    },
    async ({ from, body }) => {
      try {
        const plan = await invokeKinTool("convex_plan_inbound_sms", {
          phone: from,
          body,
        });
        return jsonResult({ ok: true, plan });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return jsonResult({ ok: false, error: message });
      }
    },
  );

  server.registerTool(
    "kin_handle_inbound_sms",
    {
      description:
        "Production inbound SMS pipeline via Convex (feed card, Backboard reply, Twilio send).",
      inputSchema: z.object({
        from: z.string(),
        body: z.string(),
        messageSid: z.string().optional(),
        to: z.string().optional(),
      }),
    },
    async ({ from, body, messageSid, to }) => {
      try {
        const result = await invokeKinTool("convex_handle_inbound_sms", {
          phone: from,
          body,
          messageSid,
          to,
          execute: true,
        });
        return jsonResult({ ok: true, result });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return jsonResult({ ok: false, error: message });
      }
    },
  );

  server.registerTool(
    "kin_execute_tool_plan",
    {
      description:
        "Run an explicit list of Kin MCP tools in order. Set execute=false for dry run.",
      inputSchema: z.object({
        plan: z.array(planStepSchema),
        execute: z.boolean().optional(),
      }),
    },
    async ({ plan, execute = true }) => {
      if (!execute) {
        return jsonResult({ dryRun: true, plan });
      }

      const results: Array<{
        tool: string;
        ok: boolean;
        result?: unknown;
        error?: string;
      }> = [];

      for (const step of plan) {
        try {
          const result = await invokeKinTool(step.tool, step.args);
          results.push({ tool: step.tool, ok: true, result });
        } catch (e: unknown) {
          results.push({
            tool: step.tool,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      return jsonResult({ results });
    },
  );
}
