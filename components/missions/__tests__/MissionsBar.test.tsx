import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { levelOf } from '@/lib/gamification/levels';
import type { MissionState, MissionsStatus } from '@/lib/gamification/missions';
import { MissionsBar } from '../MissionsBar';

const claimDay = vi.fn();
let status: MissionsStatus;

vi.mock('../MissionsProvider', () => ({
  useMissions: () => ({ status, level: levelOf(status.xp), landing: false, visit: vi.fn(), claimDay }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mission = (key: string, title: string, period: MissionState['period'], done = false): MissionState => ({
  key: key as MissionState['key'],
  title,
  xp: key === 'open-app' ? 10 : 50,
  period,
  done,
});

const withMissions = (missions: MissionState[]): MissionsStatus => ({ xp: 0, missions, months: [], earned: [] });

describe('MissionsBar (faixa das Missões na Início)', () => {
  beforeEach(() => claimDay.mockClear());

  it('o XP do dia só vem do "Resgatar", que some depois de tocado', () => {
    status = withMissions([
      mission('first-income', 'Registrar a primeira renda', 'once'),
      mission('open-app', 'Resgatar o XP do dia', 'day'),
    ]);
    render(<MissionsBar />);
    expect(claimDay).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resgatar 10 XP do dia' }));
    expect(claimDay).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Resgatar/ })).toBeNull();
    expect(screen.getByText('Registrar a primeira renda')).toBeTruthy();
  });

  it('sem "Resgatar" quando o XP de hoje já foi resgatado', () => {
    status = withMissions([
      mission('first-income', 'Registrar a primeira renda', 'once'),
      mission('open-app', 'Resgatar o XP do dia', 'day', true),
    ]);
    render(<MissionsBar />);
    expect(screen.queryByRole('button', { name: /Resgatar/ })).toBeNull();
  });

  it('com tudo feito, fica só para resgatar o dia; depois, some', () => {
    status = withMissions([
      mission('first-income', 'Registrar a primeira renda', 'once', true),
      mission('open-app', 'Resgatar o XP do dia', 'day'),
    ]);
    const { container, rerender } = render(<MissionsBar />);
    expect(screen.getByText('Resgatar o XP do dia')).toBeTruthy();

    status = withMissions([
      mission('first-income', 'Registrar a primeira renda', 'once', true),
      mission('open-app', 'Resgatar o XP do dia', 'day', true),
    ]);
    rerender(<MissionsBar />);
    expect(container.innerHTML).toBe('');
  });
});
