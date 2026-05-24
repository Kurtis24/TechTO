export function getConvexUrl(): string {
  const url =
    process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  if (!url) {
    throw new Error(
      "CONVEX_URL is not set. Add it to mcp-server/.env or pass in Cursor mcp.json env.",
    );
  }
  return url;
}
