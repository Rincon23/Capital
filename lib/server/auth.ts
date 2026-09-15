import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { getDb } from './db';
import { account, session, user, verification } from './db/schema';
import { confirmEmailMessage, resetPasswordMessage, sendMail } from './mailer';
import { allowedOriginHosts } from './origins';
import { hashAccountPassword, verifyAccountPassword } from './passwords';

const DAY_IN_SECONDS = 60 * 60 * 24;

/**
 * Better Auth: e-mail + password with e-mail confirmation and password reset, sessions in
 * Postgres. BETTER_AUTH_URL is the public URL of the app (links in e-mails point there);
 * BETTER_AUTH_SECRET signs the session cookie and the e-mail tokens.
 */
function createAuth() {
  return betterAuth({
    appName: 'Capital',
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: allowedOriginHosts().map((host) => `https://${host}`),
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    advanced: { database: { generateId: 'uuid' } },
    session: { expiresIn: 30 * DAY_IN_SECONDS, updateAge: DAY_IN_SECONDS },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      password: { hash: hashAccountPassword, verify: verifyAccountPassword },
      sendResetPassword: async ({ user: target, url }) => {
        await sendMail(resetPasswordMessage(target.email, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: target, url }) => {
        await sendMail(confirmEmailMessage(target.email, url));
      },
    },
    // Must stay last: lets Server Actions set/clear the session cookie.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Created on first use, so importing this module never needs DATABASE_URL (e.g. at build time). */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
