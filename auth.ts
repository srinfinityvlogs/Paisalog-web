import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

/**
 * Auth.js v5 config. Uses JWT sessions (not database sessions) — the
 * encrypted session cookie itself carries the Google access/refresh tokens
 * and, once created, the user's PaisaLog Sheet ID. This means the MVP needs
 * no database at all. If you outgrow this later (e.g. you want an admin
 * view, or to look up a user's sheet from a server context without their
 * session), swap to a database adapter — everything else stays the same.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          // access_type=offline is what makes Google actually issue a
          // refresh_token (without it you only get a short-lived access
          // token and the user would need to re-consent every hour).
          // prompt=consent forces the consent screen every time, which
          // guarantees a refresh_token even on repeat sign-ins during
          // development (Google only issues one on the FIRST consent
          // otherwise, which is easy to get stuck on while testing).
          access_type: 'offline',
          prompt: 'consent',
          scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets',
        },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, trigger, session }) {
      // First sign-in: persist the tokens Google just issued.
      if (account) {
        if (!account.access_token || !account.expires_at) {
          throw new Error('Google did not return an access_token/expires_at — check the OAuth scope/consent config.');
        }
        return {
          ...token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          refresh_token: account.refresh_token,
        };
      }

      // Called from the client via `update()` after we create the user's
      // Sheet for the first time — see app/api/sheets/create/route.ts.
      if (trigger === 'update' && session?.sheetId) {
        return { ...token, sheetId: session.sheetId };
      }

      // Access token still valid — nothing to do.
      if (Date.now() < (token.expires_at as number) * 1000) {
        return token;
      }

      // Access token expired — refresh it.
      if (!token.refresh_token) {
        return { ...token, error: 'MissingRefreshToken' as const };
      }
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID!,
            client_secret: process.env.AUTH_GOOGLE_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: token.refresh_token as string,
          }),
        });
        const refreshed = await response.json();
        if (!response.ok) throw refreshed;

        return {
          ...token,
          access_token: refreshed.access_token,
          expires_at: Math.floor(Date.now() / 1000 + refreshed.expires_in),
          // Google usually doesn't return a new refresh_token on refresh — keep the old one.
          refresh_token: refreshed.refresh_token ?? token.refresh_token,
        };
      } catch (err) {
        console.error('Failed to refresh Google access token:', err);
        return { ...token, error: 'RefreshFailed' as const };
      }
    },

    async session({ session, token }) {
      session.accessToken = token.access_token as string;
      session.sheetId = (token.sheetId as string) || null;
      session.error = token.error as string | undefined;
      return session;
    },
  },
});
