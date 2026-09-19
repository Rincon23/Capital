// @vitest-environment node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FeatureAnnouncement } from '../../notifications/announcements';
import { runAnnouncementsJob } from '../announcements';
import * as schema from '../db/schema';
import type { Database } from '../db/types';
import { PostgresNotificationsRepository } from '../notificationsRepository';
import { sendUserNotification } from '../notify';

let db: Database;

beforeAll(async () => {
  const pglite = drizzle({ client: new PGlite(), schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  db = pglite;
}, 60_000);

const PUBLISHED = '2026-09-18T12:00:00Z';
const NOVIDADE: FeatureAnnouncement = {
  key: 'central-de-notificacoes',
  title: '🔔 Central de notificações',
  body: 'Agora o Capital guarda um histórico de tudo que já te avisou.',
  href: '/notificacoes',
  publishedAt: PUBLISHED,
};

/** An account that already existed when the feature shipped, so the job has news for it. */
async function oldAccount() {
  const id = randomUUID();
  await db
    .insert(schema.user)
    .values({ id, name: 'Teste', email: `${id}@teste.local`, createdAt: new Date('2026-09-01T00:00:00Z') });
  return { id, feed: new PostgresNotificationsRepository(db, id) };
}

/** The hourly job only runs once an hour, so each round has to be an hour further on. */
const round = (n: number) => new Date(Date.parse(PUBLISHED) + n * 60 * 60 * 1000);

describe('novidades do app', () => {
  it('avisa uma vez só, mesmo rodando o job de novo', async () => {
    const { feed } = await oldAccount();

    expect((await runAnnouncementsJob(db, [NOVIDADE], round(1))).notified).toBe(1);
    expect((await runAnnouncementsJob(db, [NOVIDADE], round(2))).notified).toBe(0);

    const { notifications } = await feed.list();
    expect(notifications).toHaveLength(1);
  });

  it('não avisa quem criou a conta depois da novidade', async () => {
    const id = randomUUID();
    await db
      .insert(schema.user)
      .values({ id, name: 'Nova', email: `${id}@teste.local`, createdAt: new Date('2026-09-19T00:00:00Z') });

    await runAnnouncementsJob(db, [NOVIDADE], round(3));

    const { notifications } = await new PostgresNotificationsRepository(db, id).list();
    expect(notifications).toHaveLength(0);
  });

  it('não volta a avisar depois que a pessoa apaga o aviso', async () => {
    const { feed } = await oldAccount();
    await runAnnouncementsJob(db, [NOVIDADE], round(4));

    const [aviso] = (await feed.list()).notifications;
    await feed.remove(aviso.id);
    expect((await feed.list()).notifications).toHaveLength(0);

    // Sem a lápide, o job acharia que nunca avisou e mandaria tudo de novo — de hora em hora.
    expect((await runAnnouncementsJob(db, [NOVIDADE], round(5))).notified).toBe(0);
    expect((await feed.list()).notifications).toHaveLength(0);
    expect((await feed.list()).unread).toBe(0);
  });

  it('apaga de verdade um aviso que nada recria (um lembrete)', async () => {
    const { id, feed } = await oldAccount();
    await sendUserNotification(db, id, {
      category: 'reminder',
      message: { title: 'Pagar o aluguel', body: 'Hoje às 9h', url: '/lembretes' },
    });

    const [lembrete] = (await feed.list()).notifications;
    await feed.remove(lembrete.id);

    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, id));
    expect(rows).toHaveLength(0);
  });
});
