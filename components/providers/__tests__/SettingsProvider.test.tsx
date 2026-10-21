import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_SPECIAL_CATEGORY_LABELS, createDefaultTopics, type BudgetSettings } from '@/lib/budget';
import { budgetRepository } from '@/lib/storage';
import { SettingsProvider, useSettings } from '../SettingsProvider';

vi.mock('@/lib/storage', () => ({
  budgetRepository: {
    getSettings: vi.fn(),
    saveSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

// An account without VIP, with the default "Só VIP" modules.
vi.mock('../AuthProvider', () => ({
  useAuth: () => ({ user: { vip: false, vipModules: ['banks', 'voice'] } }),
}));

let api: ReturnType<typeof useSettings> | null = null;
function Probe() {
  const value = useSettings();
  useEffect(() => {
    api = value;
  });
  return <p>{value.settings ? 'pronto' : 'carregando'}</p>;
}

describe('SettingsProvider', () => {
  it('dois avisos salvos ao mesmo tempo, a partir das mesmas configurações, ficam os dois', async () => {
    const loaded: BudgetSettings = {
      topics: createDefaultTopics(),
      specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS,
      dismissedNotices: ['intro:budget'],
    };
    vi.mocked(budgetRepository.getSettings).mockResolvedValue(loaded);
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    await screen.findByText('pronto');

    const stale = api!.settings!;
    await act(async () => {
      await Promise.all([
        api!.saveSettings({ ...stale, dismissedNotices: [...stale.dismissedNotices!, 'hint:swipe-month'] }),
        api!.saveSettings({ ...stale, dismissedNotices: [...stale.dismissedNotices!, 'first-steps:budget'] }),
      ]);
    });

    const saves = vi.mocked(budgetRepository.saveSettings).mock.calls;
    expect(saves.at(-1)![0].dismissedNotices).toEqual(['intro:budget', 'hint:swipe-month', 'first-steps:budget']);
    await waitFor(() =>
      expect(api!.settings!.dismissedNotices).toEqual(['intro:budget', 'hint:swipe-month', 'first-steps:budget']),
    );
  });

  it('nunca liga um módulo "Só VIP" numa conta sem VIP, como o servidor', async () => {
    vi.mocked(budgetRepository.getSettings).mockResolvedValue({
      topics: createDefaultTopics(),
      specialCategories: DEFAULT_SPECIAL_CATEGORY_LABELS,
    });
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    await screen.findByText('pronto');

    await act(async () => {
      await api!.saveSettings({ ...api!.settings!, modules: { expenses: true, voice: true } });
    });
    expect(vi.mocked(budgetRepository.saveSettings).mock.calls.at(-1)![0].modules).toEqual({
      expenses: true,
      voice: false,
    });
    await waitFor(() => expect(api!.settings!.modules).toEqual({ expenses: true, voice: false }));
  });
});
