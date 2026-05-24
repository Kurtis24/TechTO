/**
 * Public HTTP routes for Kin.
 *
 *   POST /sms/inbound — Twilio inbound-message webhook. Each SMS becomes a
 *                       card in the feed. The Convex reactive query in the
 *                       UI picks it up live (no refresh).
 *
 * Convex HTTP actions are exposed at https://<deployment>.convex.site/<path>
 * — note `.convex.site`, not `.convex.cloud` (that one is the data plane).
 *
 * Set in the Convex dashboard (Settings → Environment Variables):
 *   TWILIO_AUTH_TOKEN     — used to validate X-Twilio-Signature
 *   TWILIO_ACCOUNT_SID    — only if you want outbound replies
 *   TWILIO_PHONE_NUMBER   — only if you want outbound replies
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// ─── POST /sms/inbound ───────────────────────────────────────────────────────
http.route({
  path: "/sms/inbound",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Twilio sends application/x-www-form-urlencoded.
    const rawBody = await req.text();
    const form = new URLSearchParams(rawBody);

    // ── Optional but recommended: verify the Twilio signature. ──────────────
    // If TWILIO_AUTH_TOKEN is set, reject anything that doesn't match.
    // If it's not set, accept (useful for early dev / curl testing).
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const signature = req.headers.get("x-twilio-signature");
    if (authToken) {
      if (!signature) {
        return new Response("Missing X-Twilio-Signature", { status: 401 });
      }
      const ok = await verifyTwilioSignature(
        authToken,
        signature,
        req.url,
        form,
      );
      if (!ok) {
        return new Response("Bad signature", { status: 401 });
      }
    }

    const from = form.get("From") ?? "";
    const to = form.get("To") ?? "";
    const body = (form.get("Body") ?? "").trim();
    const messageSid = form.get("MessageSid") ?? "";

    if (!from || !body) {
      // Twilio expects 200 even on no-op so it doesn't retry forever.
      return twiml("");
    }

    // Route + execute MCP-aligned pipeline (feed card, Backboard reply, Twilio).
    try {
      const pipeline = await ctx.runAction(api.agent.handleInboundSms, {
        phone: from,
        body,
        messageSid,
        to,
        execute: true,
      });
      if (pipeline.results.some((r) => !r.ok)) {
        console.error(
          "handleInboundSms partial failure:",
          pipeline.results.filter((r) => !r.ok),
        );
      }
    } catch (err) {
      console.error("handleInboundSms pipeline error (non-fatal):", err);
    }

    return twiml("");
  }),
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function twiml(xml: string): Response {
  const body = `<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`;
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

/**
 * Twilio signature: HMAC-SHA1 of (full URL + sorted "key + value" pairs)
 * keyed with the auth token, then base64. Spec:
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
async function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  form: URLSearchParams,
): Promise<boolean> {
  const keys: string[] = [];
  for (const k of form.keys()) keys.push(k);
  keys.sort();
  let data = url;
  for (const k of keys) {
    data += k + (form.get(k) ?? "");
  }

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const expected = bufferToBase64(sig);
  return timingSafeEqual(expected, signature);
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default http;
