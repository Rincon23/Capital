import bcrypt from 'bcryptjs';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

/** New and changed passwords use Better Auth's default hash (scrypt). */
export const hashAccountPassword = hashPassword;

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;

/**
 * Accounts migrated from Supabase keep their bcrypt hash, so their current password keeps
 * working; every other account (and any password changed after the migration) is scrypt.
 */
export async function verifyAccountPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (BCRYPT_HASH.test(hash)) return bcrypt.compare(password, hash);
  return verifyPassword({ hash, password });
}
