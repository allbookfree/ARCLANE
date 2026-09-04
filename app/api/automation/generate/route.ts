import {
  buildStagePrompt,
  channelSystemPrompt,
  stageMaxTokens,
  type AutomationStage,
  type WorkflowContext,
} from './prompts';
import { accessGateResponse } from '../../_lib/access';

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';
type GenerateRequest = {
  provider?: ProviderId;
  model?: string;
  apiKey?: string;
  stage?: AutomationStage;
  context?: WorkflowContext;
  extraInstructions?: string;
  baseUrl?: string;
  completionPath?: string;
  authMethod?: AuthMethod;
  headerName?: string;
  webSearchEnabled?: boolean;
};
type Source = { title: string; url: string };
type ProviderResult = { output: string; sources: Source[]; grounded: boolean; attempts?: number };
type ProviderFetchResult = { payload: unknown; attempts: number };
type ProviderRequestProfile = { timeoutMs: number; maxAttempts: number; totalBudgetMs: number; taskLabel: string };

// The whole provider call chain (every attempt plus every retry wait) must
// finish inside this budget so a graceful error always reaches the browser
// before the hosting platform (Vercel, 300s on every plan) kills the function.
const TOTAL_PROVIDER_BUDGET_MS = 280000;
const MIN_ATTEMPT_HEADROOM_MS = 15000;

class ProviderRequestError extends Error {
  status: number;
  attempts: number;
  retryAfterSeconds?: number;
  errorCode?: string;

  constructor(message: string, status: number, attempts: number, retryAfterSeconds?: number, errorCode?: string) {
    super(message);
    this.name = 'ProviderRequestError';
    this.status = status;
    this.attempts = attempts;
    this.retryAfterSeconds = retryAfterSeconds;
    this.errorCode = errorCode;
  }
}

const validStages = new Set<AutomationStage>([
  'ideas', 'research', 'scripts', 'script_review', 'script_translate', 'voiceover', 'visuals',
  'audio', 'thumbnails', 'description', 'shorts',
]);
const blockedHosts = new Set(['localhost', '0.0.0.0', '127.0.0.1', '::1']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function uniqueSources(sources: Source[]) {
  return sources.filter((source, index, all) => source.url.startsWith('http')
    && all.findIndex((item) => item.url === source.url) === index).slice(0, 30);
}

function safeProviderMessage(payload: unknown, fallback: string) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  const message = error.message ?? record.message;
  return typeof message === 'string' && message.trim()
    ? `${fallback}: ${message.trim().slice(0, 500)}`
    : fallback;
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

function providerErrorCode(payload: unknown) {
  const root = asRecord(payload);
  const error = asRecord(root.error);
  const details = asRecord(error.details);
  const candidates = [error.code, error.type, error.status, details.error_code, root.code, root.status];
  return candidates.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim();
}

function retryAfterSeconds(response: Response, payload: unknown) {
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  const serialized = JSON.stringify(payload);
  const retryDelay = serialized.match(/\"retry(?:D|_d)elay\"\s*:\s*\"?(\d+(?:\.\d+)?)s/i)
    ?? serialized.match(/retry (?:in|after)\s+(\d+(?:\.\d+)?)\s*s/i);
  return retryDelay ? Math.ceil(Number(retryDelay[1])) : undefined;
}

function requiresAccountAction(payload: unknown) {
  const serialized = JSON.stringify(payload).toLowerCase();
  return /credit_balance|insufficient_quota|quota_exceeded|spend_limit|usage_limit|billing|enforced_spend|monthly api usage|daily quota/.test(serialized);
}

function friendlyProviderError(providerName: string, status: number, payload: unknown, retryAfter?: number) {
  const raw = safeProviderMessage(payload, `${providerName} rejected the generation request`);
  if (status === 400) return `${raw}. The selected model or enabled tool may be incompatible with this request.`;
  if (status === 401) return `${providerName} rejected the API key. Verify the saved key and try again.`;
  if (status === 403) return `${providerName} denied access. Check the model, project, region, or API-key permissions.`;
  if (status === 404) return `${providerName} could not find this model or endpoint. Refresh the model list and select an available generation model.`;
  if (status === 429 && requiresAccountAction(payload)) return `${raw}. This is a quota, credit, billing, or spend-limit issue; automatic retry cannot fix it.`;
  if (status === 429) return `${raw}.${retryAfter !== undefined ? ` Try again in about ${retryAfter} second${retryAfter === 1 ? '' : 's'}.` : ' Wait briefly before trying again.'}`;
  if ([500, 502, 503, 504, 529].includes(status)) return `${providerName} is temporarily unavailable or overloaded. The request was retried safely but did not recover.`;
  return raw;
}

function waitFor(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function providerRequestProfile(stage: AutomationStage): ProviderRequestProfile {
  const labels: Record<AutomationStage, string> = {
    ideas: 'Idea generation',
    research: 'Research',
    scripts: 'Script Draft',
    script_review: 'Script Recheck',
    script_translate: 'Script Translation',
    voiceover: 'Voiceover preparation',
    visuals: 'Visual planning',
    audio: 'Audio planning',
    thumbnails: 'Thumbnail planning',
    description: 'Description writing',
    shorts: 'Shorts planning',
  };
  if (stage === 'visuals') {
    // Visual planning is the largest Studio request. Gemini documents 503 as a
    // transient capacity error and recommends a small number of exponential
    // retries with jitter.
    return { timeoutMs: 360000, maxAttempts: 4, totalBudgetMs: TOTAL_PROVIDER_BUDGET_MS, taskLabel: labels[stage] };
  }
  if (stage === 'scripts' || stage === 'script_review' || stage === 'script_translate') {
    return { timeoutMs: 360000, maxAttempts: 2, totalBudgetMs: TOTAL_PROVIDER_BUDGET_MS, taskLabel: labels[stage] };
  }
  if (stage === 'research' || stage === 'voiceover') {
    return { timeoutMs: 300000, maxAttempts: 2, totalBudgetMs: TOTAL_PROVIDER_BUDGET_MS, taskLabel: labels[stage] };
  }
  if (stage === 'shorts') {
    return { timeoutMs: 300000, maxAttempts: 3, totalBudgetMs: TOTAL_PROVIDER_BUDGET_MS, taskLabel: labels[stage] };
  }
  return { timeoutMs: 180000, maxAttempts: 3, totalBudgetMs: TOTAL_PROVIDER_BUDGET_MS, taskLabel: labels[stage] };
}

async function providerFetch(url: string, init: RequestInit, providerName: string, profile: ProviderRequestProfile): Promise<ProviderFetchResult> {
  const { timeoutMs, maxAttempts, totalBudgetMs, taskLabel } = profile;
  const deadline = Date.now() + totalBudgetMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_HEADROOM_MS) {
      throw new ProviderRequestError(
        `${providerName} did not finish ${taskLabel} within the safe ${Math.round(totalBudgetMs / 60000)}-minute window, so the request was stopped before the host could cut it off. No saved work was replaced. Retry once; if this repeats, choose a faster compatible model.`,
        504, Math.max(1, attempt - 1),
      );
    }
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
      });
    } catch (fetchError) {
      const timedOut = fetchError instanceof Error && (fetchError.name === 'TimeoutError' || fetchError.name === 'AbortError');
      const outOfTime = deadline - Date.now() < MIN_ATTEMPT_HEADROOM_MS;
      if (!timedOut && !outOfTime && attempt < maxAttempts) {
        await waitFor(700 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 350));
        continue;
      }
      throw new ProviderRequestError(
        timedOut ? `${providerName} did not finish ${taskLabel} within ${Math.max(1, Math.round(Math.min(timeoutMs, remaining) / 60000))} minutes. No saved work was replaced. Retry once; if this repeats, choose a faster compatible model.`
          : `${providerName} could not be reached after ${attempt} attempt${attempt === 1 ? '' : 's'}. Check the connection and try again.`,
        timedOut ? 504 : 502, attempt,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      throw new ProviderRequestError(`${providerName} unexpectedly redirected the generation request.`, 502, attempt);
    }

    const payload = await readJson(response);
    if (response.ok) return { payload, attempts: attempt };

    const status = response.status;
    const retryAfter = retryAfterSeconds(response, payload);
    const actionRequired = status === 429 && requiresAccountAction(payload);
    const transient = [408, 409, 429, 500, 502, 503, 504, 529].includes(status) && !actionRequired;
    if (transient && attempt < maxAttempts) {
      const baseDelay = [500, 502, 503, 504, 529].includes(status) ? 2000 : 1200;
      const fallbackDelay = baseDelay * (2 ** (attempt - 1)) + Math.floor(Math.random() * 700);
      const waitMilliseconds = retryAfter !== undefined ? retryAfter * 1000 + Math.floor(Math.random() * 350) : fallbackDelay;
      if (waitMilliseconds <= 60000 && waitMilliseconds + MIN_ATTEMPT_HEADROOM_MS < deadline - Date.now()) {
        await waitFor(waitMilliseconds);
        continue;
      }
    }

    const publicStatus = status === 529 ? 503 : status >= 400 && status <= 599 ? status : 502;
    throw new ProviderRequestError(
      friendlyProviderError(providerName, status, payload, retryAfter),
      publicStatus, attempt, retryAfter, providerErrorCode(payload),
    );
  }
  throw new ProviderRequestError(`${providerName} could not complete the request.`, 502, 3);
}

function usesWeb(stage: AutomationStage) {
  return stage === 'ideas' || stage === 'research';
}

function extractOpenAI(payload: unknown): ProviderResult {
  const root = asRecord(payload);
  const outputItems = Array.isArray(root.output) ? root.output : [];
  const textParts: string[] = [];
  const sources: Source[] = [];

  if (typeof root.output_text === 'string') textParts.push(root.output_text);
  for (const itemValue of outputItems) {
    const item = asRecord(itemValue);
    if (item.type === 'web_search_call') {
      const action = asRecord(item.action);
      const actionSources = Array.isArray(action.sources) ? action.sources : [];
      for (const sourceValue of actionSources) {
        const source = asRecord(sourceValue);
        if (typeof source.url === 'string') {
          sources.push({ title: typeof source.title === 'string' ? source.title : source.url, url: source.url });
        }
      }
    }
    const content = Array.isArray(item.content) ? item.content : [];
    for (const partValue of content) {
      const part = asRecord(partValue);
      if (typeof part.text === 'string') textParts.push(part.text);
      const annotations = Array.isArray(part.annotations) ? part.annotations : [];
      for (const annotationValue of annotations) {
        const annotation = asRecord(annotationValue);
        const citation = asRecord(annotation.url_citation);
        const url = typeof annotation.url === 'string' ? annotation.url
          : typeof citation.url === 'string' ? citation.url : '';
        const title = typeof annotation.title === 'string' ? annotation.title
          : typeof citation.title === 'string' ? citation.title : url;
        if (url) sources.push({ title, url });
      }
    }
  }

  const output = [...new Set(textParts.map((part) => part.trim()).filter(Boolean))].join('\n\n');
  if (!output) throw new Error('OpenAI returned no text for this stage. Try a compatible generation model.');
  return { output, sources: uniqueSources(sources), grounded: sources.length > 0 };
}

async function generateOpenAI(key: string, model: string, stage: AutomationStage, prompt: string, maxTokens: number, webEnabled: boolean) {
  const call = await providerFetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: channelSystemPrompt,
      input: prompt,
      max_output_tokens: maxTokens,
      store: false,
      ...(webEnabled ? {
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources'],
      } : {}),
    }),
  }, 'OpenAI', providerRequestProfile(stage));
  const result = extractOpenAI(call.payload);
  return { ...result, grounded: webEnabled ? result.grounded : false, attempts: call.attempts };
}

function extractAnthropic(payload: unknown): ProviderResult {
  const root = asRecord(payload);
  const blocks = Array.isArray(root.content) ? root.content : [];
  const textParts: string[] = [];
  const sources: Source[] = [];
  for (const blockValue of blocks) {
    const block = asRecord(blockValue);
    if (block.type === 'text' && typeof block.text === 'string') textParts.push(block.text);
    const citations = Array.isArray(block.citations) ? block.citations : [];
    for (const citationValue of citations) {
      const citation = asRecord(citationValue);
      const url = typeof citation.url === 'string' ? citation.url : '';
      if (url) sources.push({ title: typeof citation.title === 'string' ? citation.title : url, url });
    }
  }
  const output = textParts.join('\n\n').trim();
  if (!output) throw new Error('Anthropic returned no text for this stage. Try a compatible Claude model.');
  return { output, sources: uniqueSources(sources), grounded: sources.length > 0 };
}

async function generateAnthropic(key: string, model: string, stage: AutomationStage, prompt: string, maxTokens: number, webEnabled: boolean) {
  const tools = webEnabled ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: stage === 'research' ? 8 : 5 }] : undefined;
  const baseBody = {
    model,
    max_tokens: maxTokens,
    system: channelSystemPrompt,
    messages: [{ role: 'user', content: prompt }],
    ...(tools ? { tools } : {}),
  };
  const headers = {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
  let call = await providerFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers, body: JSON.stringify(baseBody),
  }, 'Anthropic', providerRequestProfile(stage));
  let payload = call.payload;
  let attempts = call.attempts;
  const first = asRecord(payload);
  if (webEnabled && first.stop_reason === 'pause_turn' && Array.isArray(first.content)) {
    call = await providerFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...baseBody,
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: first.content },
        ],
      }),
    }, 'Anthropic', providerRequestProfile(stage));
    payload = call.payload;
    attempts += call.attempts;
  }
  const result = extractAnthropic(payload);
  return { ...result, grounded: webEnabled ? result.grounded : false, attempts };
}

function extractGemini(payload: unknown): ProviderResult {
  const root = asRecord(payload);
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = asRecord(candidates[0]);
  const content = asRecord(first.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const output = parts.map((part) => asRecord(part).text)
    .filter((text): text is string => typeof text === 'string').join('\n\n').trim();
  const metadata = asRecord(first.groundingMetadata ?? first.grounding_metadata);
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks
    : Array.isArray(metadata.grounding_chunks) ? metadata.grounding_chunks : [];
  const sources: Source[] = [];
  for (const chunkValue of chunks) {
    const web = asRecord(asRecord(chunkValue).web);
    if (typeof web.uri === 'string') {
      sources.push({ title: typeof web.title === 'string' ? web.title : web.uri, url: web.uri });
    }
  }
  if (!output) {
    const feedback = asRecord(root.promptFeedback ?? root.prompt_feedback);
    const reason = typeof feedback.blockReason === 'string' ? ` (${feedback.blockReason})` : '';
    throw new Error(`Gemini returned no text for this stage${reason}. Try a compatible generation model.`);
  }
  return { output, sources: uniqueSources(sources), grounded: sources.length > 0 };
}

const visualResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['strategy', 'characters', 'scenes', 'timeline'],
  properties: {
    strategy: {
      type: 'object',
      additionalProperties: false,
      required: ['primaryStyle', 'approach', 'palette', 'cameraLanguage', 'archiveRule', 'disclosureNote', 'evidenceLocks', 'modestyRule', 'continuityRules'],
      properties: {
        primaryStyle: { type: 'string' },
        approach: { type: 'string' },
        palette: { type: 'string' },
        cameraLanguage: { type: 'string' },
        archiveRule: { type: 'string' },
        disclosureNote: { type: 'string' },
        evidenceLocks: { type: 'array', items: { type: 'string' } },
        modestyRule: { type: 'string' },
        continuityRules: { type: 'array', items: { type: 'string' } },
      },
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'role', 'firstClipId', 'identityLock', 'referencePrompt'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          firstClipId: { type: 'string' },
          identityLock: { type: 'string' },
          referencePrompt: { type: 'string' },
        },
      },
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sceneId', 'asset', 'shot', 'prompt', 'search', 'note'],
        properties: {
          sceneId: { type: 'string' },
          asset: { type: 'string', enum: ['ai_video', 'archive_or_artifact', 'map_or_diagram', 'stock_footage', 'ai_still_motion'] },
          shot: { type: 'string' },
          prompt: { type: 'string' },
          search: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } },
          note: { type: 'string' },
        },
      },
    },
    timeline: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['clipId', 'sceneId', 'direction'],
        properties: {
          clipId: { type: 'string' },
          sceneId: { type: 'string' },
          direction: { type: 'string' },
        },
      },
    },
  },
} as const;
async function generateGemini(key: string, model: string, stage: AutomationStage, prompt: string, maxTokens: number, webEnabled: boolean) {
  const normalizedModel = model.replace(/^models\//, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent`;
  const requestBody = (structuredJson: boolean) => JSON.stringify({
    systemInstruction: { parts: [{ text: channelSystemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(structuredJson ? { responseMimeType: 'application/json', responseJsonSchema: visualResponseJsonSchema } : {}),
    },
    ...(webEnabled ? { tools: [{ google_search: {} }] } : {}),
  });
  const headers = { 'x-goog-api-key': key, 'Content-Type': 'application/json' };
  const profile = providerRequestProfile(stage);
  const wantsStructuredJson = stage === 'visuals';
  let call: ProviderFetchResult;
  try {
    call = await providerFetch(endpoint, {
      method: 'POST', headers, body: requestBody(wantsStructuredJson),
    }, 'Google Gemini', profile);
  } catch (error) {
    if (!(wantsStructuredJson && error instanceof ProviderRequestError && error.status === 400)) throw error;
    call = await providerFetch(endpoint, {
      method: 'POST', headers, body: requestBody(false),
    }, 'Google Gemini', profile);
  }
  const result = extractGemini(call.payload);
  return { ...result, grounded: webEnabled ? result.grounded : false, attempts: call.attempts };
}
function createCustomTarget(baseUrl: string, completionPath: string) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = completionPath.replace(/^\/+/, '');
  const url = new URL(normalizedPath, normalizedBase);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || blockedHosts.has(hostname) || hostname.endsWith('.local') || hostname.includes(':')) {
    throw new Error('Custom providers must use a public HTTPS generation endpoint.');
  }
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    const privateIp = parts.some((part) => part > 255) || parts[0] === 10 || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168);
    if (privateIp) throw new Error('Custom providers must use a public HTTPS generation endpoint.');
  }
  return url.toString();
}

async function generateCustom(body: GenerateRequest, prompt: string, maxTokens: number) {
  const baseUrl = body.baseUrl?.trim();
  if (!baseUrl) throw new Error('This custom provider has no saved base URL.');
  const endpoint = createCustomTarget(baseUrl, body.completionPath?.trim() || '/chat/completions');
  const headerName = body.headerName?.trim() || 'x-api-key';
  if (!/^[A-Za-z0-9-]{1,80}$/.test(headerName)) throw new Error('The custom API key header is invalid.');
  const key = body.apiKey!.trim();
  const authHeaders: Record<string, string> = body.authMethod === 'api-key'
    ? { [headerName]: key }
    : { Authorization: `Bearer ${key}` };
  const call = await providerFetch(endpoint, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: body.model,
      messages: [
        { role: 'system', content: channelSystemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
    }),
  }, 'Custom provider', providerRequestProfile(body.stage ?? 'scripts'));
  const root = asRecord(call.payload);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  let output = typeof message.content === 'string' ? message.content : '';
  if (!output && Array.isArray(message.content)) {
    output = message.content.map((part) => asRecord(part).text)
      .filter((text): text is string => typeof text === 'string').join('\n\n');
  }
  if (!output.trim()) throw new Error('The custom provider returned no compatible text output.');
  return { output: output.trim(), sources: [], grounded: false, attempts: call.attempts } satisfies ProviderResult;
}

export async function POST(request: Request) {
  const denied = await accessGateResponse(request);
  if (denied) return denied;
  try {
    const body = await request.json() as GenerateRequest;
    const provider = body.provider;
    const stage = body.stage;
    const model = body.model?.trim();
    const apiKey = body.apiKey?.trim();
    const extraInstructions = body.extraInstructions?.trim() ?? '';

    if (!provider || !['openai', 'anthropic', 'gemini', 'custom'].includes(provider)) {
      return Response.json({ error: 'Choose a connected AI provider.' }, { status: 400 });
    }
    if (!stage || !validStages.has(stage)) {
      return Response.json({ error: 'Choose a valid Studio stage.' }, { status: 400 });
    }
    if (!model || model.length > 300 || !apiKey || apiKey.length > 1000) {
      return Response.json({ error: 'Choose a saved model connection before generating.' }, { status: 400 });
    }
    if (extraInstructions.length > 5000) {
      return Response.json({ error: 'Keep optional directions under 5,000 characters.' }, { status: 400 });
    }
    const context = body.context ?? {};
    if (JSON.stringify(context).length > 350000) {
      return Response.json({ error: 'The project context is too large for one generation request.' }, { status: 413 });
    }
    const externalEvidence = stage === 'research' && typeof context.externalEvidence === 'string'
      ? context.externalEvidence.trim()
      : '';
    if (externalEvidence.length > 60000) {
      return Response.json({ error: 'The external evidence pack is too large for one Research request.' }, { status: 413 });
    }

    const canUseWeb = usesWeb(stage) && provider !== 'custom' && body.webSearchEnabled !== false && !externalEvidence;
    const prompt = buildStagePrompt(stage, context, extraInstructions, canUseWeb);
    const maxTokens = stageMaxTokens(stage, context);
    let result: ProviderResult;
    if (provider === 'openai') result = await generateOpenAI(apiKey, model, stage, prompt, maxTokens, canUseWeb);
    else if (provider === 'anthropic') result = await generateAnthropic(apiKey, model, stage, prompt, maxTokens, canUseWeb);
    else if (provider === 'gemini') result = await generateGemini(apiKey, model, stage, prompt, maxTokens, canUseWeb);
    else result = await generateCustom(body, prompt, maxTokens);

    return Response.json({
      ...result,
      provider,
      model,
      stage,
      webSearchEnabled: canUseWeb,
      researchMode: stage === 'research'
        ? externalEvidence ? 'external-evidence' : result.grounded ? 'grounded' : 'verification-plan'
        : undefined,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The generation request could not be completed.';
    if (error instanceof ProviderRequestError) {
      return Response.json({
        error: message.slice(0, 800),
        attempts: error.attempts,
        retryAfterSeconds: error.retryAfterSeconds,
        errorCode: error.errorCode,
      }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: message.slice(0, 800) }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}




