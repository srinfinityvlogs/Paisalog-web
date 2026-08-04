// Protects /dashboard — redirects to the sign-in page if there's no session.
// Note: as of Next.js 16, this file is renamed proxy.ts; if you upgrade past
// Next 15, check the Next.js middleware docs for the current convention.
export { auth as middleware } from '@/auth';

export const config = {
  matcher: ['/dashboard/:path*'],
};
