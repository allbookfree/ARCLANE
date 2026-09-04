import { accessGateResponse } from '../../../_lib/access';

type UsageRequest = { apiKey?: string };

type UsageData = {
  remainingCredits: number;
  planCredits: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function numberValue(...values: unknown[]) {
  const value = values.find((candidate) => typeof candidate === 'number' && Number.isFinite(candidate));
  return typeof value === 'number' ? value : undefined;
}

function stringValue(...values: unknown[]) {
  const value = values.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value.trim() : undefined;
}

function waitFor(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response: Response) {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function errorMessage(status: number, payload: unknown) {
  const root = asRecord(payload);
  const error = asRecord(root.error);
  const detail = stringValue(error.message, root.error, root.message);
  if (status === 401) return 'Firecrawl rejected this API key. Copy a current key from the Firecrawl dashboard and try again.';
  if (status === 403) return 'This Firecrawl key cannot access team credit usage. Check its team and permissions.';
  if (status === 404) return 'Firecrawl authenticated the request but could not find credit information for this team.';
  if (status === 429) return 'Firecrawl temporarily limited the credit check. Wait briefly and try again.';
  if ([500, 502, 503, 504].includes(status)) return 'Firecrawl credit usage is temporarily unavailable. Your saved key was not changed.';
  return detail ? `Firecrawl could not verify the key: ${detail.slice(0, 400)}` : 'Firecrawl could not verify this key or return credit usage.';
}

async function fetchUsage(apiKey: string) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (attempt < 2) {
        await waitFor(700);
        continue;
      }
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new Error(timedOut ? 'Firecrawl credit check timed out after 30 seconds.' : 'Firecrawl could not be reached for the credit check.');
    }
    if (response.status >= 300 && response.status < 400) throw new Error('Firecrawl unexpectedly redirected the credit check.');
    const payload = await response.json().catch(() => null) as unknown;
    if (response.ok) return payload;
    const transient = [408, 429, 500, 502, 503, 504].includes(response.status);
    const waitMilliseconds = retryAfterMilliseconds(response) ?? 750;
    if (transient && attempt < 2 && waitMilliseconds <= 5000) {
      await waitFor(waitMilliseconds);
      continue;
    }
    const error = new Error(errorMessage(response.status, payload)) as Error & { status?: number };
    error.status = response.status >= 400 && response.status <= 599 ? response.status : 502;
    throw error;
  }
  throw new Error('Firecrawl could not return credit usage.');
}

function parseUsage(payload: unknown): UsageData | null {
  const data = asRecord(asRecord(payload).data);
  const remainingCredits = numberValue(data.remainingCredits, data.remaining_credits);
  const planCredits = numberValue(data.planCredits, data.plan_credits);
  if (remainingCredits === undefined || planCredits === undefined) return null;
  return {
    remainingCredits,
    planCredits,
    billingPeriodStart: stringValue(data.billingPeriodStart, data.billing_period_start),
    billingPeriodEnd: stringValue(data.billingPeriodEnd, data.billing_period_end),
  };
}

export async function POST(request: Request) {
  const denied = await accessGateResponse(request);
  if (denied) return denied;
  try {
    const body = await request.json() as UsageRequest;
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey || apiKey.length > 1000) return Response.json({ error: 'Enter a Firecrawl API key before checking credits.' }, { status: 400 });
    const usage = parseUsage(await fetchUsage(apiKey));
    if (!usage) return Response.json({ error: 'Firecrawl responded, but its credit data was incomplete. The key was not saved.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ ...usage, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : 502;
    const message = error instanceof Error ? error.message : 'Firecrawl credit usage could not be checked.';
    return Response.json({ error: message.slice(0, 800) }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
