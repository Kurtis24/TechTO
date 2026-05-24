import { ConvexHttpClient } from "convex/browser";
import { getConvexUrl } from "./config.js";

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    client = new ConvexHttpClient(getConvexUrl());
  }
  return client;
}
