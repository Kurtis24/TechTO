import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConvexTools } from "./tools/convex.js";
import { registerSmsTools } from "./tools/sms.js";
import { toolCatalogJson } from "./registry.js";

export function createKinMcpServer(): McpServer {
  const server = new McpServer({
    name: "kin",
    version: "0.1.0",
  });

  registerConvexTools(server);
  registerSmsTools(server);

  server.registerResource(
    "tool-catalog",
    "kin://tool-catalog",
    {
      description: "JSON catalog of all Kin MCP tools and Convex mappings",
      mimeType: "application/json",
    },
    async () => ({
      contents: [
        {
          uri: "kin://tool-catalog",
          mimeType: "application/json",
          text: toolCatalogJson(),
        },
      ],
    }),
  );

  return server;
}
