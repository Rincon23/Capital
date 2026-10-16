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
});
