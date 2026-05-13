/// Auth.js v5 catch-all handler. `handlers` is the route map object
/// exported from src/auth.ts; we destructure its GET + POST.
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
