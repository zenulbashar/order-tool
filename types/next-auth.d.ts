import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** Add the user id (used for venue scoping) to the session. */
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
