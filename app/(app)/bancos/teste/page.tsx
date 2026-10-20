import { notFound } from 'next/navigation';
import { ProbeScreen } from './ProbeScreen';

/** F0 of the Open Finance module: a plain page to try Pluggy's API. Development only. */
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ProbeScreen />;
}
