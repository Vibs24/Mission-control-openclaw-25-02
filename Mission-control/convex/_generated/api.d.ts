/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountability from "../accountability.js";
import type * as activities from "../activities.js";
import type * as admin from "../admin.js";
import type * as agents from "../agents.js";
import type * as automation from "../automation.js";
import type * as chat from "../chat.js";
import type * as documents from "../documents.js";
import type * as executionEvents from "../executionEvents.js";
import type * as executionGraph from "../executionGraph.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as reviews from "../reviews.js";
import type * as tasks from "../tasks.js";
import type * as telegram from "../telegram.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountability: typeof accountability;
  activities: typeof activities;
  admin: typeof admin;
  agents: typeof agents;
  automation: typeof automation;
  chat: typeof chat;
  documents: typeof documents;
  executionEvents: typeof executionEvents;
  executionGraph: typeof executionGraph;
  messages: typeof messages;
  notifications: typeof notifications;
  reviews: typeof reviews;
  tasks: typeof tasks;
  telegram: typeof telegram;
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
