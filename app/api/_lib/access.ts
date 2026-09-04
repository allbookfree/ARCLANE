// Shared access-gate helpers for the API routes. The gate is completely
// inactive unless the deployment sets ARCLANE_ACCESS_CODE (at least four
// characters), so local development and self-hosted setups without the
// variable behave exactly as before. When enabled, an HttpOnly cookie derived
// from the code (never the code itself) unlocks every protected route.

const ACCESS_COOKIE = 'arclane_access';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function accessCode() {
  return process.env.ARCLANE_ACCESS_CODE?.trim() ?? '';
}

export function accessGateEnabled() {
  return accessCode().length >= 4;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function expectedAccessToken() {
  return sha256Hex(`arclane-access:${accessCode()}`);
}

function readCookieToken(request: Request) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ACCESS_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export async function accessUnlocked(request: Request) {
  if (!accessGateEnabled()) return true;
  return readCookieToken(request) === await expectedAccessToken();
}

export function accessDeniedResponse() {
  return Response.json(
    { error: 'This Arclane deployment is protected. Enter the access code once to continue.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

// Returns a 401 response when the gate is active and the request is not
// unlocked, or null when the request may proceed.
export async function accessGateResponse(request: Request) {
  return (await accessUnlocked(request)) ? null : accessDeniedResponse();
}

export async function accessUnlockResponse(request: Request, providedCode: string) {
  const trimmed = providedCode.trim();
  const providedToken = await sha256Hex(`arclane-access:${trimmed}`);
  if (trimmed.length < 4 || providedToken !== await expectedAccessToken()) {
    return Response.json(
      { required: true, unlocked: false, error: 'That access code does not match. Try again.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const requestUrl = new URL(request.url);
  const secure = (request.headers.get('x-forwarded-proto') ?? '').includes('https') || requestUrl.protocol === 'https:';
  return Response.json(
    { required: true, unlocked: true },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Set-Cookie': `${ACCESS_COOKIE}=${providedToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`,
      },
    },
  );
}
