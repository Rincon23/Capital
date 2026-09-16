import 'server-only';

/**
 * The app has one owner (me): the account whose e-mail is `OWNER_EMAIL`. A few modules —
 * the AI expense entry and the Gmail monitor — run on my own hardware and accounts, so they
 * are the owner's only. This is checked on the server, never trusted from the browser.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!owner || !email) return false;
  return email.trim().toLowerCase() === owner;
}
