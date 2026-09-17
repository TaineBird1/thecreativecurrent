/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as agents_clientsuccess from "../agents/clientsuccess.js";
import type * as agents_content from "../agents/content.js";
import type * as agents_design from "../agents/design.js";
import type * as agents_leadgen from "../agents/leadgen.js";
import type * as agents_orchestrator from "../agents/orchestrator.js";
import type * as agents_outreach from "../agents/outreach.js";
import type * as agents_proposal from "../agents/proposal.js";
import type * as agents_seo from "../agents/seo.js";
import type * as agents_strategy from "../agents/strategy.js";
import type * as approvals from "../approvals.js";
import type * as auth from "../auth.js";
import type * as authStore from "../authStore.js";
import type * as bots from "../bots.js";
import type * as calls from "../calls.js";
import type * as clients from "../clients.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as escalations from "../escalations.js";
import type * as kpis from "../kpis.js";
import type * as leads from "../leads.js";
import type * as lib_killSwitch from "../lib/killSwitch.js";
import type * as lib_pricingDefault from "../lib/pricingDefault.js";
import type * as lib_run from "../lib/run.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_soft from "../lib/soft.js";
import type * as lib_time from "../lib/time.js";
import type * as library from "../library.js";
import type * as llm from "../llm.js";
import type * as logs from "../logs.js";
import type * as outbound from "../outbound.js";
import type * as rate from "../rate.js";
import type * as runs from "../runs.js";
import type * as scrapeJobs from "../scrapeJobs.js";
import type * as seed from "../seed.js";
import type * as sequences from "../sequences.js";
import type * as settings from "../settings.js";
import type * as standups from "../standups.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  "agents/clientsuccess": typeof agents_clientsuccess;
  "agents/content": typeof agents_content;
  "agents/design": typeof agents_design;
  "agents/leadgen": typeof agents_leadgen;
  "agents/orchestrator": typeof agents_orchestrator;
  "agents/outreach": typeof agents_outreach;
  "agents/proposal": typeof agents_proposal;
  "agents/seo": typeof agents_seo;
  "agents/strategy": typeof agents_strategy;
  approvals: typeof approvals;
  auth: typeof auth;
  authStore: typeof authStore;
  bots: typeof bots;
  calls: typeof calls;
  clients: typeof clients;
  crons: typeof crons;
  emails: typeof emails;
  escalations: typeof escalations;
  kpis: typeof kpis;
  leads: typeof leads;
  "lib/killSwitch": typeof lib_killSwitch;
  "lib/pricingDefault": typeof lib_pricingDefault;
  "lib/run": typeof lib_run;
  "lib/settings": typeof lib_settings;
  "lib/soft": typeof lib_soft;
  "lib/time": typeof lib_time;
  library: typeof library;
  llm: typeof llm;
  logs: typeof logs;
  outbound: typeof outbound;
  rate: typeof rate;
  runs: typeof runs;
  scrapeJobs: typeof scrapeJobs;
  seed: typeof seed;
  sequences: typeof sequences;
  settings: typeof settings;
  standups: typeof standups;
  tasks: typeof tasks;
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
