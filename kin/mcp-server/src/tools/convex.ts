import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { invokeKinTool, jsonResult } from "../invoke.js";
import { KIN_TOOL_REGISTRY } from "../registry.js";

export function registerConvexTools(server: McpServer): void {
  for (const tool of KIN_TOOL_REGISTRY) {
    server.registerTool(
      tool.name,
      {
        description: `${tool.description} (Convex ${tool.kind}: ${tool.convexRef})`,
        inputSchema: tool.inputSchema,
      },
      async (args) => {
        try {
          const result = await invokeKinTool(tool.name, args);
          return jsonResult({ ok: true, result });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          return jsonResult({ ok: false, error: message });
        }
      },
    );
  }
}
