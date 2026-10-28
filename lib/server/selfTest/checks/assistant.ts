import { randomUUID } from 'node:crypto';
import { categoryOptions, cleanTranscript, readExpenseText } from '../../../ai';
import { todayISO } from '../../../budget/date';
import { createDefaultSettings } from '../../../budget/seed';
import { levelOf } from '../../../gamification/levels';
import { effectiveModules } from '../../../modules';
import { notificationSlots } from '../../../reminders';
import { addDays } from '../../../reminders/time';
import { aiConfig } from '../../ai/providers';
import { expect, expectEqual, fetchWithTimeout, type SelfCheck } from '../check';

/** Lembretes, Lançar por voz ou texto and Missões. */

const HOUR_MS = 60 * 60 * 1000;
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
