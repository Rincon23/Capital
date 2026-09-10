import type { Metadata } from 'next';
import { LoginScreen } from '@/components/screens/LoginScreen';

export const metadata: Metadata = {
  title: 'Entrar — Capital',
};

export default function LoginPage() {
  return <LoginScreen />;
}
