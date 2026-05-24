/**
 * Tools the SMS router LLM may choose (must be implemented in smsExecutor.ts).
 */

export type SmsCatalogTool = {
  name: string;
  description: string;
  argsHint: string;
};

/** Context / action tools the LLM can plan. Terminals are added by finalizeSmsPlan. */
export const SMS_ROUTABLE_TOOLS: SmsCatalogTool[] = [
  {
    name: "convex_get_accounts",
    description: "Household account balances (chequing, savings, joint).",
    argsHint: "{}",
  },
  {
    name: "convex_get_agreements",
    description: "Who owes whom (e-transfer / debt between partners).",
    argsHint: '{ "status": "open" } optional',
  },
  {
    name: "convex_get_cards",
    description: "Active feed alerts (overdraft, duplicate, creep, outlier).",
    argsHint: '{ "includeResolved": false } optional',
  },
  {
    name: "convex_get_subscribers",
    description: "Match sender phone to a subscribed name.",
    argsHint: '{ "activeOnly": false }',
  },
  {
    name: "convex_get_transactions",
    description: "Recent transactions across accounts.",
    argsHint: '{ "limit": 20 } optional',
  },
  {
    name: "convex_get_goals",
    description: "Household savings goals.",
    argsHint: "{}",
  },
  {
    name: "convex_get_forecast",
    description: "7-day overdraft forecast for one account.",
    argsHint: '{ "accountId": "<id from ACCOUNT HINTS>" }',
  },
  {
    name: "convex_run_detection",
    description: "Re-run anomaly engine (duplicate, creep, overdraft cards).",
    argsHint: "{}",
  },
  {
    name: "convex_create_goal",
    description: "Create a new savings goal or budget (name, targetCents, deadline).",
    argsHint: '{ "name": "Vacation", "targetCents": 200000, "deadline": <unix ms> }',
  },
  {
    name: "convex_update_goal",
    description: "Update an existing goal's name, target amount, deadline, or saved amount.",
    argsHint: '{ "goalId": "<id>", "name": "...", "targetCents": 200000 }',
  },
  {
    name: "convex_delete_goal",
    description: "Delete a savings goal by its ID.",
    argsHint: '{ "goalId": "<id>" }',
  },
  {
    name: "convex_add_savings_to_goal",
    description: "Record money saved toward a goal (increments savedCents).",
    argsHint: '{ "goalId": "<id>", "amountCents": 20000 }',
  },
  {
    name: "convex_send_briefing",
    description:
      "Send the full morning briefing SMS (only if user explicitly asks for briefing/morning summary).",
    argsHint: '{ "phone": "<sender phone>" }',
  },
];

export const SMS_ROUTABLE_TOOL_NAMES = new Set(
  SMS_ROUTABLE_TOOLS.map((t) => t.name),
);
