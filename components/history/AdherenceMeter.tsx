import { formatPct } from '@/lib/budget';

export function AdherenceMeter({
  label,
  targetPct,
  actualPct,
  color,
}: {
  label: string;
  targetPct: number;
  actualPct: number;
  color: string;
}) {
  const scaleMax = Math.max(targetPct * 1.3, actualPct * 1.1, 0.05);
  const actualWidth = Math.min((actualPct / scaleMax) * 100, 100);
  const targetPosition = Math.min((targetPct / scaleMax) * 100, 100);
  const over = actualPct > targetPct;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-foreground font-medium">{label}</span>
        <span className={over ? 'text-danger font-medium' : 'text-muted'}>
          {formatPct(actualPct)} gasto · meta {formatPct(targetPct, 0)}
        </span>
      </div>
      <div className="bg-border relative h-3 rounded-full">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${actualWidth}%`, backgroundColor: color }}
        />
        <div
          className="bg-foreground absolute top-[-3px] h-[18px] w-[2px]"
          style={{ left: `${targetPosition}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
