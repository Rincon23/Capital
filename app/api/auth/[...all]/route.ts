import { getAuth } from '@/lib/server/auth';

// Better Auth's own endpoints: the links in the confirmation / password-reset e-mails land here.
export async function GET(request: Request) {
  return getAuth().handler(request);
}

export async function POST(request: Request) {
  return getAuth().handler(request);
}
