import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { recordAuthEvent } from "@/server/audit";
import { clientIp } from "@/server/auth/client-ip";
import { attemptLogin } from "@/server/auth/login";

class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const maxAgeHours = Number(process.env.SESSION_MAX_AGE_HOURS ?? 8);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: { strategy: "jwt", maxAge: maxAgeHours * 3600, updateAge: 15 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const result = await attemptLogin(credentials, clientIp(request.headers));
        if (!result.ok) {
          if (result.reason === "rate_limited") throw new RateLimited();
          return null;
        }
        return { id: result.userId, email: result.email };
      },
    }),
  ],
  callbacks: {
    // The token carries only the user id. Role and school are re-read from the
    // database on every request (src/server/session.ts).
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const sub = "token" in message ? message.token?.sub : undefined;
      if (sub) await recordAuthEvent("auth.logout", sub);
    },
  },
});
