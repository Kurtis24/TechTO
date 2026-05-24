"use node";

/**
 * Outbound SMS via the Twilio REST API.
 *
 * Auth: HTTP Basic Auth with TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN. If you
 * created an API Key instead, set TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET
 * and we'll prefer those.
 *
 * Required Convex env vars (Settings → Environment Variables):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN          (or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)
 *   TWILIO_PHONE_NUMBER        E.164, e.g. "+14165551234"
 */

import { action } from "./_generated/server";
import { v } from "convex/values";

export const sendSms = action({
  args: {
    to: v.string(), // E.164
    body: v.string(),
  },
  handler: async (
    _ctx,
    { to, body }
  ): Promise<{ ok: true; sid: string } | { ok: false; error: string }> => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !from) {
      return {
        ok: false,
        error:
          "TWILIO_ACCOUNT_SID and TWILIO_PHONE_NUMBER must be set in the Convex dashboard.",
      };
    }

    const apiKey = process.env.TWILIO_API_KEY_SID;
    const apiSecret = process.env.TWILIO_API_KEY_SECRET;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    let basicUser: string;
    let basicPass: string;
    if (apiKey && apiSecret) {
      basicUser = apiKey;
      basicPass = apiSecret;
    } else if (authToken) {
      basicUser = sid;
      basicPass = authToken;
    } else {
      return {
        ok: false,
        error:
          "Missing TWILIO_AUTH_TOKEN (or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET).",
      };
    }

    const auth = Buffer.from(`${basicUser}:${basicPass}`).toString("base64");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const form = new URLSearchParams({ To: to, From: from, Body: body });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Twilio sendSms error", res.status, text);
      return { ok: false, error: `Twilio ${res.status}: ${text}` };
    }
    const json = (await res.json()) as { sid: string };
    return { ok: true, sid: json.sid };
  },
});
