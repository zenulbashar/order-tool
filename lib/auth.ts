import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

import { renderSignInEmail } from "@/lib/auth-email";
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
  pages: { signIn: "/signin", verifyRequest: "/signin/check-inbox" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      // Fully lower-case + validate the address before it is stored or looked
      // up, so casing never forks a second account.
      normalizeIdentifier: normalizeEmail,
      // Send the branded Prompt2Eat sign-in email instead of the provider's
      // plain default ("Sign in to <host>" + a generic button). Env is read
      // lazily here (same contract as lib/customer/email.ts), so build/typecheck
      // run with none present.
      async sendVerificationRequest({ identifier, url }) {
        const apiKey = process.env.RESEND_API_KEY;
        const from = process.env.EMAIL_FROM;
        if (!apiKey || !from) {
          throw new Error(
            "RESEND_API_KEY / EMAIL_FROM are not set — cannot send the sign-in email.",
          );
        }
        const { subject, html, text } = renderSignInEmail(url);
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to: identifier, subject, html, text }),
        });
        if (!response.ok) {
          throw new Error(`Resend send failed with status ${response.status}.`);
        }
      },
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
