'use client';

import type { TooltipContentProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { formatBRL, formatMonthShort, type MonthSummary } from '@/lib/budget';

export interface TopicSeries {
  id: string;
  name: string;
  color: string;
}

function buildSeriesData(
  summaries: MonthSummary[],
  topics: TopicSeries[],
  pick: (topic: MonthSummary['topics'][number]) => number,
): Record<string, number | string>[] {
  return summaries.map((summary) => {
    const row: Record<string, number | string> = { month: formatMonthShort(summary.month) };
    for (const topic of topics) {
      const found = summary.topics.find((t) => t.topicId === topic.id);
      row[topic.id] = found ? pick(found) : 0;
    }
    return row;
  });
}

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="border-border bg-card rounded-lg border px-3 py-2 text-sm shadow-lg">
      <p className="text-foreground mb-1 font-medium">{label}</p>
      <div className="flex flex-col gap-0.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-muted">{entry.name}:</span>
            <span className="text-foreground font-medium">{formatBRL(Number(entry.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const AXIS_TICK = { fill: 'var(--color-muted-foreground)', fontSize: 12 };
const GRID_STROKE = 'var(--color-border)';

function yTickFormatter(value: number): string {
  return value.toLocaleString('pt-BR');
}

export function SpendingLineChart({
  summaries,
  topics,
}: {
  summaries: MonthSummary[];
  topics: TopicSeries[];
}) {
  const data = buildSeriesData(summaries, topics, (t) => t.spent);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={yTickFormatter} width={56} />
        <Tooltip content={(props) => <ChartTooltip {...props} />} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }} />
        {topics.map((topic) => (
          <Line
            key={topic.id}
            type="monotone"
            dataKey={topic.id}
            name={topic.name}
            stroke={topic.color}
            strokeWidth={2}
            dot={{ r: 4, fill: topic.color, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RemainingLineChart({
  summaries,
  topics,
}: {
  summaries: MonthSummary[];
  topics: TopicSeries[];
}) {
  const data = buildSeriesData(summaries, topics, (t) => t.remaining);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={yTickFormatter} width={56} />
        <Tooltip content={(props) => <ChartTooltip {...props} />} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }} />
        {topics.map((topic) => (
          <Line
            key={topic.id}
            type="monotone"
            dataKey={topic.id}
            name={topic.name}
            stroke={topic.color}
            strokeWidth={2}
            dot={{ r: 4, fill: topic.color, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CompositionBarChart({
  summaries,
  topics,
}: {
  summaries: MonthSummary[];
  topics: TopicSeries[];
}) {
  const data = buildSeriesData(summaries, topics, (t) => t.spent);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={16}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="month" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={yTickFormatter} width={56} />
        <Tooltip content={(props) => <ChartTooltip {...props} />} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }} />
        {topics.map((topic) => (
          <Bar
            key={topic.id}
            dataKey={topic.id}
            name={topic.name}
            stackId="spent"
            fill={topic.color}
            maxBarSize={24}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
