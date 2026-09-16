/**
 * Time-of-day greeting, as the bot says it: 05–12h "Bom dia", 12–18h "Boa tarde",
 * otherwise "Boa noite" (correction 6 of the bot spec, which greeted "Bom dia" always).
 */
export interface Greeting {
  text: string;
  emoji: string;
}

export function greetingFor(date: Date = new Date()): Greeting {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return { text: 'Bom dia', emoji: '☀️' };
  if (hour >= 12 && hour < 18) return { text: 'Boa tarde', emoji: '🌤️' };
  return { text: 'Boa noite', emoji: '🌙' };
}

/** "Bom dia, Enzo" (or just "Bom dia" when there is no name to use). */
export function greetingLine(name: string | null | undefined, date: Date = new Date()): string {
  const { text } = greetingFor(date);
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${text}, ${firstName}` : text;
}
