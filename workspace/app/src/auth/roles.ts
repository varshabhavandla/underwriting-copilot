import type { Role } from "./session";

export type Action = "view" | "intake" | "build" | "decide" | "deliver" | "admin" | "account";
const ALLOWED: Record<Action, readonly Role[]> = {
  view: ["viewer", "processor", "underwriter", "admin"],
  intake: ["processor", "underwriter", "admin"],
  build: ["processor", "underwriter", "admin"],
  // The database decision gate additionally requires the actor to be an underwriter; this check only fails earlier and more clearly.
  decide: ["underwriter"],
  deliver: ["admin"],
  admin: ["admin"],
  account: ["viewer", "processor", "underwriter", "admin"],
};
export const can = (role: Role | undefined, action: Action): boolean => role !== undefined && ALLOWED[action].includes(role);
