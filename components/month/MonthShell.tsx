'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  currentMonthKey,
  withCurrentTopicDisplay,
  type CategoryKind,
  type Expense,
  type Income,
  type Month,
} from '@/lib/budget';
import { useMonthData } from '@/lib/hooks/useMonthData';
import { isModuleOn } from '@/lib/modules';
import { walletRepository } from '@/lib/storage';
import { setLastViewedMonth } from '@/lib/storage/preferences';
import { useSettings } from '@/components/providers/SettingsProvider';
import { subscribeTourSheets } from '@/components/modules/tour/tourSheets';
import { InstallmentEditor, type InstallmentEditRequest } from '@/components/card/InstallmentEditor';
import { VoiceEntrySheet } from '@/components/voice/VoiceEntrySheet';
import { MonthContext } from './MonthContext';
import { ExpenseFormSheet } from './ExpenseFormSheet';
import { IncomeFormSheet } from './IncomeFormSheet';

type ExpenseFormState =
  | {
      open: true;
      initial?: Expense;
      draft?: Partial<Expense>;
      defaultCategoryKind?: CategoryKind;
      /** Editing one instalment on its own, which the form says out loud. */
      singleInstallment?: boolean;
      /** Opened by a tour to show the form: no keyboard popping up over it. */
      forTour?: boolean;
    }
  | { open: false };
type IncomeFormState = { open: true; initial?: Income } | { open: false };

/** The line shown while a single instalment is being edited, so the scope stays clear. */
const SINGLE_INSTALLMENT_NOTE =
  'Você está editando só a parcela deste mês. Se depois editar a compra toda, este ajuste é desfeito.';

export function MonthShell({ month, children }: { month: Month; children: ReactNode }) {
  const { settings } = useSettings();
  const monthData = useMonthData(month, settings?.topics);

  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({ open: false });
  const [incomeForm, setIncomeForm] = useState<IncomeFormState>({ open: false });
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [installmentEdit, setInstallmentEdit] = useState<InstallmentEditRequest | null>(null);

  useEffect(() => {
    setLastViewedMonth(month);
  }, [month]);

  // A tour step can ask for the expense form (the card question, "A receber") or the voice entry.
  useEffect(
    () =>
      subscribeTourSheets((request) => {
        if (request === 'close') {
          setExpenseForm({ open: false });
          setVoiceOpen(false);
        } else if (request === 'voice') {
          setExpenseForm({ open: false });
          setVoiceOpen(true);
        } else {
          setVoiceOpen(false);
          setExpenseForm({
            open: true,
            forTour: true,
            defaultCategoryKind: request === 'expense-form-reimbursable' ? 'reimbursable' : undefined,
          });
        }
      }),
    [],
  );

  /**
   * Tapping an entry. An instalment is not an ordinary line — it belongs to a purchase that
   * spans months — so it asks what the person means to change (see `InstallmentEditor`); the
   * single expense of an "à vista" purchase *is* the purchase, and opens it straight away.
   */
  const openExpenseForm = useCallback((initial?: Expense, defaultCategoryKind?: CategoryKind) => {
    if (initial?.installmentId) {
      setInstallmentEdit(
        initial.installmentNumber === 0
          ? { kind: 'plan', installmentId: initial.installmentId }
          : {
              kind: 'scope',
              expense: initial,
              installmentId: initial.installmentId,
              number: initial.installmentNumber ?? 1,
            },
      );
      return;
    }
    setExpenseForm({ open: true, initial, defaultCategoryKind });
  }, []);
  const openIncomeForm = useCallback((initial?: Income) => {
    setIncomeForm({ open: true, initial });
  }, []);
  const voiceAvailable = isModuleOn(settings, 'voice');
  const openVoiceEntry = useCallback(() => {
    setExpenseForm({ open: false });
    setVoiceOpen(true);
  }, []);

  // A hard storage failure (e.g. the server or its database unreachable) leaves monthData
  // null forever; show the error instead of letting every child spin on "Carregando…".
  if (monthData.error && !monthData.monthData) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-foreground text-sm font-medium">Não foi possível carregar este mês</p>
        <p className="text-muted text-sm">{monthData.error}</p>
        <button
          type="button"
          onClick={() => void monthData.refresh()}
          disabled={monthData.loading}
          className="bg-primary text-primary-foreground min-h-[44px] rounded-lg px-4 font-semibold disabled:opacity-50"
        >
          {monthData.loading ? 'Tentando…' : 'Tentar novamente'}
        </button>
      </div>
    );
  }

  return (
    <MonthContext.Provider
      value={{
        ...monthData,
        month,
        openExpenseForm,
        openIncomeForm,
        openVoiceEntry: voiceAvailable ? openVoiceEntry : undefined,
      }}
    >
      {children}

      {installmentEdit && (
        <InstallmentEditor
          request={installmentEdit}
          onClose={() => setInstallmentEdit(null)}
          onChanged={() => monthData.refresh()}
          onEditSingle={(expense) => {
            setInstallmentEdit(null);
            setExpenseForm({ open: true, initial: expense, singleInstallment: true });
          }}
        />
      )}

      {expenseForm.open && settings && (
        <ExpenseFormSheet
          month={month}
          topics={
            monthData.monthData
              ? withCurrentTopicDisplay(
                  monthData.monthData.topicsSnapshot,
                  settings.topics,
                  month >= currentMonthKey(),
                )
              : settings.topics
          }
          specialCategories={settings.specialCategories}
          reimbursableEnabled={isModuleOn(settings, 'reimbursable')}
          cardEnabled={isModuleOn(settings, 'card')}
          initial={expenseForm.initial}
          draft={expenseForm.draft}
          defaultCategoryKind={expenseForm.defaultCategoryKind}
          autoFocusAmount={!expenseForm.forTour}
          note={expenseForm.singleInstallment ? SINGLE_INSTALLMENT_NOTE : undefined}
          onClose={() => setExpenseForm({ open: false })}
          onSave={monthData.saveExpense}
          onDelete={monthData.deleteExpense}
          onSaveInstallment={
            isModuleOn(settings, 'card')
              ? async (plan) => {
                  await walletRepository.saveInstallment(plan);
                  await monthData.refresh();
                }
              : undefined
          }
          onVoice={voiceAvailable ? openVoiceEntry : undefined}
        />
      )}

      {voiceOpen && settings && (
        <VoiceEntrySheet
          month={month}
          settings={settings}
          onClose={() => setVoiceOpen(false)}
          onSave={monthData.saveExpense}
          onEdit={(draft) => {
            setVoiceOpen(false);
            setExpenseForm({ open: true, draft });
          }}
        />
      )}

      {incomeForm.open && (
        <IncomeFormSheet
          month={month}
          initial={incomeForm.initial}
          onClose={() => setIncomeForm({ open: false })}
          onSave={monthData.saveIncome}
          onDelete={monthData.deleteIncome}
        />
      )}
    </MonthContext.Provider>
  );
}
