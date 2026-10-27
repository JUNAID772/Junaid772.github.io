import type { User } from './auth'
declare global {
  namespace Express {
    interface Request { user?: any }
  }
}
export {}
