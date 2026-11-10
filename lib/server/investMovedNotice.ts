import 'server-only';
import { diagramAssets, diagramSettings } from './db/schema';
import type { Database } from './db/types';
import { sendUserNotification } from './notify';
import type { PushSender } from './push';

/** Each account gets it once: the notification's `sourceKey` keeps it from coming again. */
export const INVEST_MOVED_KEY = 'invest-plus:diagram-moved';

/**
 * The Diagrama moved to the Invest + (2026-11-09): whoever used it here hears it once, in the bell
 * and on the phone, with a tap that opens the Invest + (the old `/diagrama` leads there). Runs on
 * every start; an account already told is never told again. Answers how many were told now.
 */
export async function runInvestMovedNotice(db: Database, sender?: PushSender): Promise<number> {
  const rows = [
    ...(await db.selectDistinct({ userId: diagramSettings.userId }).from(diagramSettings)),
    ...(await db.selectDistinct({ userId: diagramAssets.userId }).from(diagramAssets)),
  ];
  const people = [...new Set(rows.map((row) => row.userId))];
  let told = 0;
  for (const userId of people) {
    const sent = await sendUserNotification(
      db,
      userId,
      {
        category: 'feature',
        sourceKey: INVEST_MOVED_KEY,
        message: {
          title: '📈 O Diagrama agora é o Invest +',
          body: 'Seus ativos, notas e aportes estão lá. Entre com o mesmo e-mail e a mesma senha.',
          url: '/diagrama',
        },
      },
      sender ? { sender } : undefined,
    );
    if (sent) told += 1;
  }
  return told;
}
