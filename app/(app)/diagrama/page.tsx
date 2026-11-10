import { redirect } from 'next/navigation';
import { investUrl } from '@/lib/server/investApp';

/** The Diagrama moved to the Invest + (2026-11-09): its old address, and old links, lead there. */
export default function DiagramaPage() {
  redirect(`${investUrl()}/diagrama`);
}
