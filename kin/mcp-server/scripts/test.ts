#!/usr/bin/env bun
/**
 * Smoke-test the Kin MCP layer without starting stdio.
 *
 *   bun run scripts/test.ts              # routing only (offline)
 *   bun run scripts/test.ts --live       # also hit Convex (read + dry-run SMS pipeline)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { routeInboundSms } from "../../convex/smsRouter.js";
import { getConvexUrl } from "../src/config.js";
import { invokeKinTool } from "../src/invoke.js";
import { KIN_TOOL_REGISTRY } from "../src/registry.js";

function loadEnvLocal() {
  const path = resolve(import.meta.dir, "../../.env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  if (!process.env.CONVEX_URL && process.env.NEXT_PUBLIC_CONVEX_URL) {
    process.env.CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
  }
}

const live = process.argv.includes("--live");

function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`);
}

async function main() {
  loadEnvLocal();

  section("SMS routing (offline)");
  const sample = {
    from: "+14165551234",
    body: "Hey Kin — how much is in my chequing account?",
  };
  const plan = routeInboundSms(sample);
  console.log("Sample:", sample);
  console.log("Summary:", plan.summary);
  console.log("Planned tools:", plan.recommendedTools.length);
  for (const step of plan.recommendedTools) {
    console.log(`  • ${step.tool} — ${step.reason}`);
  }

  const hasChat = plan.recommendedTools.some((s) => s.tool === "convex_chat_reply");
  const hasSend = plan.recommendedTools.some((s) => s.tool === "convex_send_sms");
  if (!hasChat || !hasSend) {
    console.error("FAIL: expected convex_chat_reply and convex_send_sms in default plan");
    process.exit(1);
  }
  console.log("OK: default reply path present");

  section("Tool registry");
  console.log(`Registered MCP tools: ${KIN_TOOL_REGISTRY.length}`);

  if (!live) {
    console.log("\n(Pass --live to run Convex queries against your deployment.)");
    return;
  }

  section("Convex connectivity");
  const url = getConvexUrl();
  console.log("CONVEX_URL:", url.replace(/\/\/[^@]+@/, "//***@"));

  const accounts = await invokeKinTool("convex_get_accounts", {});
  const list = accounts as unknown[];
  console.log(`convex_get_accounts → ${Array.isArray(list) ? list.length : "?"} account(s)`);

  section("Inbound SMS pipeline (dry run)");
  try {
    const dry = await invokeKinTool("convex_handle_inbound_sms", {
      phone: sample.from,
      body: sample.body,
      execute: false,
    });
    const text = JSON.stringify(dry, null, 2);
    console.log(text.slice(0, 1200) + (text.length > 1200 ? "…" : ""));
    console.log("OK: convex_handle_inbound_sms (dry run)");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Could not find public function")) {
      console.warn(
        "SKIP: agent.handleInboundSms not deployed yet. Run `cd kin && npx convex dev` to push.",
      );
    } else {
      throw e;
    }
  }

  console.log("\nLive checks passed (see SKIP warnings above if any).");
}

main().catch((err) => {
  console.error("\nTest failed:", err);
  process.exit(1);
});
