import { accessGateEnabled, accessUnlockResponse, accessUnlocked } from '../_lib/access';

export async function GET(request: Request) {
  if (!accessGateEnabled()) {
    return Response.json({ required: false, unlocked: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return Response.json(
    { required: true, unlocked: await accessUnlocked(request) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  if (!accessGateEnabled()) {
    return Response.json({ required: false, unlocked: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  let code = '';
  try {
    const body = await request.json() as { code?: unknown };
    if (typeof body.code === 'string') code = body.code;
  } catch {
    // Fall through with an empty code; the unlock check rejects it.
  }
  return accessUnlockResponse(request, code);
}
