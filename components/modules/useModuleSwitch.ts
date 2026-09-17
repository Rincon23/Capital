'use client';

import { useCallback, useState } from 'react';
import type { ModuleFlags, ModuleKey } from '@/lib/budget';
import { moduleDefinition, moduleNames, storedModules, turnModuleOff, turnModuleOn } from '@/lib/modules';
import { useSettings } from '@/components/providers/SettingsProvider';
import { useConfirm } from '@/components/ui/ConfirmSheet';
import { useToast } from '@/components/ui/Toast';

export type TurnOnOutcome = { ok: true } | { ok: false; missing: ModuleKey[] };

/**
 * Turning modules on and off, saved right away with a toast and "Desfazer". A module whose
 * parent is off is never turned on (nor is the parent turned on for it): the caller gets the
 * missing modules back to explain it. Turning off a module others depend on asks first and
 * turns them off too. Nothing here touches the user's data.
 */
export function useModuleSwitch() {
  const { settings, saveSettings } = useSettings();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    async (modules: ModuleFlags, message: string) => {
      if (!settings) return false;
      const previous = storedModules(settings);
      setBusy(true);
      try {
        await saveSettings({ ...settings, modules });
      } catch {
        showToast('Não foi possível salvar. Tente novamente em alguns instantes.', 'error');
        return false;
      } finally {
        setBusy(false);
      }
      showToast(message, 'success', {
        action: {
          label: 'Desfazer',
          onClick: () => {
            void saveSettings({ ...settings, modules: previous })
              .then(() => showToast('Pronto, voltou como estava.', 'info'))
              .catch(() => showToast('Não foi possível desfazer. Tente de novo.', 'error'));
          },
        },
      });
      return true;
    },
    [settings, saveSettings, showToast],
  );

  const turnOn = useCallback(
    async (key: ModuleKey): Promise<TurnOnOutcome> => {
      const result = turnModuleOn(settings, key);
      if (!result.ok) return result;
      await save(result.modules, `${moduleDefinition(key).name} ligado.`);
      return { ok: true };
    },
    [settings, save],
  );

  const turnOff = useCallback(
    async (key: ModuleKey): Promise<boolean> => {
      const { modules, alsoOff } = turnModuleOff(settings, key);
      const name = moduleDefinition(key).name;
      if (alsoOff.length > 0) {
        const confirmed = await confirm({
          title: `Desligar ${name}?`,
          message: `${alsoOff.length === 1 ? 'Este módulo depende' : 'Estes módulos dependem'} de ${name} e também ${alsoOff.length === 1 ? 'vai desligar' : 'vão desligar'}: ${moduleNames(alsoOff)}. Nenhum dado é apagado: religou, está tudo lá.`,
          confirmLabel: 'Desligar',
          cancelLabel: 'Manter ligado',
          destructive: true,
        });
        if (!confirmed) return false;
      }
      return save(
        modules,
        alsoOff.length > 0 ? `${moduleNames([key, ...alsoOff])} desligados.` : `${name} desligado.`,
      );
    },
    [settings, save, confirm],
  );

  return { turnOn, turnOff, busy };
}
