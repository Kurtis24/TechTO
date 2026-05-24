#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKinMcpServer } from "./server.js";

async function main() {
  const server = createKinMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Kin MCP server failed:", err);
  process.exit(1);
});
