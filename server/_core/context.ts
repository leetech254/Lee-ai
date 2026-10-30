import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  // This single-user, self-hosted app has no sign-in flow or user database.
  // Keep a null value for compatibility with unused scaffold procedures, without
  // making an OAuth or platform request on every local inference call.
  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}
