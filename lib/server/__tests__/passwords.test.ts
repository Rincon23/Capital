// @vitest-environment node
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { hashAccountPassword, verifyAccountPassword } from '../passwords';

describe('verifyAccountPassword', () => {
  it('accepts the bcrypt hashes carried over from Supabase ($2a$)', async () => {
    const hash = (await bcrypt.hash('senha-antiga-123', 10)).replace(/^\$2b\$/, () => '$2a$');
    expect(hash.startsWith('$2a$')).toBe(true);

    expect(await verifyAccountPassword({ hash, password: 'senha-antiga-123' })).toBe(true);
    expect(await verifyAccountPassword({ hash, password: 'outra-senha' })).toBe(false);
  });

  it('accepts passwords hashed by Better Auth (scrypt)', async () => {
    const hash = await hashAccountPassword('senha-nova-456');
    expect(hash.startsWith('$2')).toBe(false);

    expect(await verifyAccountPassword({ hash, password: 'senha-nova-456' })).toBe(true);
    expect(await verifyAccountPassword({ hash, password: 'errada' })).toBe(false);
  });
});
