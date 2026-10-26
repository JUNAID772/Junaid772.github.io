let csrfToken = ''

async function ensureCsrf() {
  if (csrfToken) return csrfToken
  const r = await fetch('/api/csrf', { credentials: 'include' })
  const d = await r.json()
  csrfToken = d.token
  return csrfToken
}

export class ApiError extends Error {
  status: number
  data: any
  constructor(msg: string, status: number, data?: any) { super(msg); this.status = status; this.data = data }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  if (opts.method && opts.method !== 'GET') headers['x-csrf-token'] = await ensureCsrf()
  let res: Response
  try {
    res = await fetch(path, { method: opts.method || 'GET', headers, credentials: 'include', body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data)
  return data as T
}
