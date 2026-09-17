import 'server-only';

/**
 * The server's administrator: the account whose e-mail is `OWNER_EMAIL`. It never unlocks a
 * feature (every module is for every user); it only decides who sees server setup details,
 * such as the Google redirect URI on the Gmail monitor screen.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!owner || !email) return false;
  return email.trim().toLowerCase() === owner;
}
