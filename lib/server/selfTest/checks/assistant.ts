import { randomUUID } from 'node:crypto';
import { and, count, eq, isNull, lt, or } from 'drizzle-orm';
import { categoryOptions, cleanTranscript, readExpenseText } from '../../../ai';
import { todayISO } from '../../../budget/date';
import { createDefaultSettings } from '../../../budget/seed';
import { levelOf } from '../../../gamification/levels';
import { matchKeywords } from '../../../gmail/match';
import { effectiveModules } from '../../../modules';
import { notificationSlots } from '../../../reminders';
import { addDays } from '../../../reminders/time';
import { aiConfig } from '../../ai/providers';
import { gmailAccounts } from '../../db/schema';
import { googleConfig } from '../../gmail/google';
import { schedulerRunning } from '../../scheduler';
import { expect, expectEqual, expectRefused, fetchWithTimeout, type SelfCheck } from '../check';

/** Lembretes, Lançar por voz ou texto, Monitor de Gmail and Missões. */

const HOUR_MS = 60 * 60 * 1000;
/** Gmail is checked every minute; past this, the monitor stopped. */
const GMAIL_LATE_MS = 15 * 60 * 1000;
const AI_TIMEOUT_MS = 5_000;

export const remindersChecks: SelfCheck[] = [
  {
    id: 'reminders.schedule',
    name: 'Lembrete e tarefa do dia têm aviso marcado',
    run: ({ scratch }) =>
      scratch(async ({ reminders, today }) => {
        const now = new Date();
        const task = randomUUID();
        const appointment = randomUUID();
        await reminders.saveReminder({
          id: task,
          kind: 'daily',
          message: 'Beber água',
          repeat: false,
          times: ['08:00', '20:00'],
        });
        await reminders.saveReminder({
          id: appointment,
          kind: 'once',
          message: 'Dentista',
          repeat: false,
          date: addDays(today, 1),
          time: '09:00',
          notifyBeforeMinutes: null,
        });

        const slotsFor = async (id: string) => {
          const schedule = await reminders.loadSchedule(now);
          return notificationSlots(schedule, now, new Date(now.getTime() + 48 * HOUR_MS)).filter(
            (slot) => slot.reminderId === id,
          );
        };
        expect(
          (await slotsFor(task)).length > 0,
          'A tarefa do dia não tem nenhum aviso nas próximas 48 horas.',
        );
        expect((await slotsFor(appointment)).length > 0, 'O lembrete de amanhã não tem aviso marcado.');

        await reminders.setDone(task, today, true, now);
        expectEqual((await slotsFor(task)).length, 0, 'Avisos da tarefa depois de "Realizado"');
      }),
  },
];

export const voiceChecks: SelfCheck[] = [
  {
    id: 'voice.rules',
    name: 'Entende valor, data, cartão e categoria do texto',
    async run({ now }) {
      const settings = {
        ...createDefaultSettings(),
        modules: effectiveModules({ vip: true, vipModules: [] }),
      };
      const today = todayISO(now);
      const reading = readExpenseText(
        cleanTranscript('Gastei 32,50 no mercado ontem no cartão, categoria diversos'),
        categoryOptions(settings),
        today,
      );
      expectEqual(reading.amount, 32.5, 'Valor');
      expectEqual(reading.date, addDays(today, -1), 'Data ("ontem")');
      expectEqual(reading.card, true, 'No cartão');
      expectEqual(reading.category.option?.label, 'Diversos', 'Categoria');
    },
  },
  {
    id: 'voice.ai',
    name: 'IA da placa (Whisper e Ollama) respondendo',
    external: true,
    async run() {
      const config = aiConfig();
      if (!config)
        return {
          status: 'skip',
          message: 'A IA não está configurada neste servidor (WHISPER_URL e OLLAMA_URL).',
        };
      const tags = await fetchWithTimeout(`${config.ollamaUrl}/api/tags`, AI_TIMEOUT_MS);
      expect(tags.ok, `O Ollama respondeu ${tags.status}.`);
      const { models = [] } = (await tags.json()) as { models?: Array<{ name?: string; model?: string }> };
      expect(
        models.some((model) => model.name === config.ollamaModel || model.model === config.ollamaModel),
        `O modelo ${config.ollamaModel} não está instalado no Ollama.`,
      );
      // Any answer means whisper-server is up; only a server error is a problem.
      const whisper = await fetchWithTimeout(config.whisperUrl, AI_TIMEOUT_MS);
      await whisper.body?.cancel();
      expect(whisper.status < 500, `O Whisper respondeu ${whisper.status}.`);
    },
  },
];

export const gmailChecks: SelfCheck[] = [
  {
    id: 'gmail.match',
    name: 'Palavras-chave acham o e-mail, sem repetir',
    run: ({ scratch }) =>
      scratch(async ({ gmail }) => {
        const mail = {
          subject: 'Sua fatura de outubro chegou',
          from: 'Banco X <avisos@bancox.com.br>',
          snippet: 'O BOLETO vence dia 10',
        };
        expectEqual(
          matchKeywords(mail, ['Fatura', 'boleto', 'pix']),
          ['Fatura', 'boleto'],
          'Palavras encontradas',
        );

        await gmail.addKeyword('Fatura');
        await expectRefused(gmail.addKeyword('fatura'), 'A mesma palavra-chave entrou duas vezes.');
        const alert = { messageId: 'autoteste', keywords: ['Fatura'], ...mail, receivedAt: new Date() };
        expect(await gmail.recordAlert(alert), 'O aviso do e-mail não foi guardado.');
        expect(!(await gmail.recordAlert(alert)), 'O mesmo e-mail seria avisado duas vezes.');
      }),
  },
  {
    id: 'gmail.monitor',
    name: 'Monitor de Gmail conferindo as contas',
    async run({ db, now }) {
      const [{ connected }] = await db.select({ connected: count() }).from(gmailAccounts);
      if (connected === 0) return { status: 'skip', message: 'Nenhum Gmail conectado.' };
      expect(
        googleConfig(),
        'Há Gmail conectado, mas o servidor está sem GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.',
      );
      if (!schedulerRunning())
        return { status: 'skip', message: 'As tarefas em segundo plano estão desligadas aqui.' };

      const [{ late }] = await db
        .select({ late: count() })
        .from(gmailAccounts)
        .where(
          and(
            eq(gmailAccounts.status, 'ok'),
            or(
              isNull(gmailAccounts.lastCheckedAt),
              lt(gmailAccounts.lastCheckedAt, new Date(now.getTime() - GMAIL_LATE_MS)),
            ),
          ),
        );
      expect(
        late === 0,
        `${late === 1 ? '1 conta não é conferida' : `${late} contas não são conferidas`} há mais de 15 minutos.`,
      );
      const [{ stuck }] = await db
        .select({ stuck: count() })
        .from(gmailAccounts)
        .where(or(eq(gmailAccounts.status, 'error'), eq(gmailAccounts.status, 'reconnect')));
      if (stuck > 0) {
        return {
          status: 'warn',
          message: `${stuck === 1 ? '1 conta precisa' : `${stuck} contas precisam`} reconectar o Gmail ou deu erro na última conferência.`,
        };
      }
    },
  },
];

export const missionsChecks: SelfCheck[] = [
  {
    id: 'missions.xp',
    name: 'Missão cumprida dá XP uma vez só',
    run: ({ scratch }) =>
      scratch(async ({ budget, missions, month, today }) => {
        const modules = effectiveModules({ vip: true, vipModules: [] });
        await budget.saveIncome(month, { id: randomUUID(), source: 'Salário', amount: 1000, date: today });

        const first = await missions.check({ modules, now: new Date() });
        const earned = first.earned.map((item) => item.key);
        expect(
          earned.includes('first-income'),
          'A primeira renda não deu a missão "Registrar a primeira renda".',
        );
        expect(earned.includes('month-income'), 'A renda do mês não deu a missão "Registrar uma renda".');
        expectEqual(
          first.xp,
          first.earned.reduce((total, item) => total + item.xp, 0),
          'XP da conta',
        );
        expect(levelOf(first.xp).level >= 1, 'O nível da conta não foi calculado.');

        const second = await missions.check({ modules, now: new Date() });
        expectEqual(second.earned.length, 0, 'Missões ganhas de novo na segunda conferência');
        expectEqual(second.xp, first.xp, 'XP depois da segunda conferência');
      }),
  },
];
