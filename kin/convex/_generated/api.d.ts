/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agentState from "../agentState.js";
import type * as backboardActions from "../backboardActions.js";
import type * as briefing from "../briefing.js";
import type * as crons from "../crons.js";
import type * as engine from "../engine.js";
import type * as http from "../http.js";
import type * as mutations from "../mutations.js";
import type * as queries from "../queries.js";
import type * as seedDemo from "../seedDemo.js";
import type * as smsExecutor from "../smsExecutor.js";
import type * as smsLlmRouter from "../smsLlmRouter.js";
import type * as smsRouter from "../smsRouter.js";
import type * as smsToolCatalog from "../smsToolCatalog.js";
import type * as sources from "../sources.js";
import type * as spike from "../spike.js";
import type * as twilioSend from "../twilioSend.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agentState: typeof agentState;
  backboardActions: typeof backboardActions;
  briefing: typeof briefing;
  crons: typeof crons;
  engine: typeof engine;
  http: typeof http;
  mutations: typeof mutations;
  queries: typeof queries;
  seedDemo: typeof seedDemo;
  smsExecutor: typeof smsExecutor;
  smsLlmRouter: typeof smsLlmRouter;
  smsRouter: typeof smsRouter;
  smsToolCatalog: typeof smsToolCatalog;
  sources: typeof sources;
  spike: typeof spike;
  twilioSend: typeof twilioSend;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
