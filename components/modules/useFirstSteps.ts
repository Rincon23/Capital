'use client';

import { useCallback, useRef } from 'react';
import { firstStepNoticesToAdd, wantsFirstSteps, type FirstStep } from '@/lib/modules';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useToast } from '@/components/ui/Toast';

/**
 * Marks steps of "Primeiros passos" as done, saved in the account's dismissed notices (only for a
 * new account that has the widget; nothing happens for anyone else). Once the third is saved the
 * widget leaves the Início, with a toast saying so.
 */
export function useMarkFirstSteps() {
  const { settings, saveSettings } = useSettings();
  const { showToast } = useToast();
  // One save at a time: the settings update when it lands, and the next call reads them.
  const saving = useRef(false);

  return useCallback(
    (steps: FirstStep[]) => {
      if (!settings || saving.current) return;
      const add = firstStepNoticesToAdd(settings, steps);
      if (add.length === 0) return;
      saving.current = true;
      const dismissedNotices = [...(settings.dismissedNotices ?? []), ...add];
      void saveSettings({ ...settings, dismissedNotices })
        .then(() => {
          if (!wantsFirstSteps({ dismissedNotices })) showToast('Primeiros passos concluídos!');
        })
        // Not saved: it is tried again the next time the step shows as done.
        .catch(() => {})
        .finally(() => {
          saving.current = false;
        });
    },
    [settings, saveSettings, showToast],
  );
}
