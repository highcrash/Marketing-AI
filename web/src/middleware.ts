/// Auth.js middleware. Re-exports the auth() function as default; the
/// `authorized` callback in src/auth.ts decides what's public and what
/// needs a session.
///
/// Matcher excludes static assets and Next internals so the middleware
/// doesn't churn on every favicon/css/image request.
export { auth as middleware } from '@/auth';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.ico).*)'],
};
