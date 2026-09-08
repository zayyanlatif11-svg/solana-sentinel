import { randomUUID } from "node:crypto";
import type { SystemEvent, SystemEventType } from "./schemas";

export function createEvent(
  type: SystemEventType,
  message: string,
  opts: {
    mint?: string;
    payload?: Record<string, unknown>;
    configVersions?: Record<string, string>;
  } = {},
): SystemEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    mint: opts.mint,
    message,
    payload: opts.payload ?? {},
    configVersions: opts.configVersions ?? {},
  };
}
