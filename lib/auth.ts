import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Magic-link sign-in requires server-side sessions backed by the adapter.
  session: { strategy: "database" },
  pages: { signIn: "/signin" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      // Fully lower-case + validate the address before it is stored or looked
      // up, so casing never forks a second account.
      normalizeIdentifier: normalizeEmail,
    }),
  ],
  callbacks: {
    // Expose the user id on the session for tenant scoping.
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
