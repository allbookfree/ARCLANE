type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
type AuthMethod = 'bearer' | 'api-key';

type ModelsRequest = {
  provider?: ProviderId;
  apiKey?: string;
  baseUrl?: string;
  modelsPath?: string;
  authMethod?: AuthMethod;
  headerName?: string;
};

type ModelResult = {
  id: string;
  name: string;
  description?: string;
};

type ProviderConfiguration = {
  name: string;
  endpoint: string;
  createHeaders: (key: string) => HeadersInit;
};

const providerConfigurations: Record<Exclude<ProviderId, 'custom'>, ProviderConfiguration> = {
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/models',
    createHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  anthropic: {
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/models?limit=1000',
    createHeaders: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
  },
  gemini: {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
    createHeaders: (key) => ({ 'x-goog-api-key': key }),
  },
};

const blockedHosts = new Set(['localhost', '0.0.0.0', '127.0.0.1', '::1']);

function createCustomTarget(baseUrl: string, modelsPath: string) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = modelsPath.replace(/^\/+/, '');
  const url = new URL(normalizedPath, normalizedBase);
  const hostname = url.hostname.toLowerCase();

  if (url.protocol !== 'https:' || blockedHosts.has(hostname) || hostname.endsWith('.local') || hostname.includes(':')) {
    throw new Error('UNSAFE_ENDPOINT');
  }

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    const privateIp = parts.some((part) => part > 255)
      || parts[0] === 10
      || parts[0] === 127
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168);
    if (privateIp) throw new Error('UNSAFE_ENDPOINT');
  }

  return url.toString();
}

function readModelList(payload: unknown, provider: ProviderId): ModelResult[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(record.data)
      ? record.data
      : Array.isArray(record.models)
        ? record.models
        : [];

  return source
    .filter((item) => {
      if (provider !== 'gemini' || !item || typeof item !== 'object') return true;
      const methods = (item as Record<string, unknown>).supportedGenerationMethods;
      return Array.isArray(methods) && methods.includes('generateContent');
    })
    .map((item): ModelResult | null => {
      if (typeof item === 'string') return { id: item, name: item };
      if (!item || typeof item !== 'object') return null;
      const model = item as Record<string, unknown>;
      const rawId = model.id ?? model.name ?? model.model ?? model.modelId;
      if (typeof rawId !== 'string' || !rawId.trim()) return null;
      const id = rawId.replace(/^models\//, '');
      const displayName = model.display_name ?? model.displayName;
      const description = typeof model.description === 'string' ? model.description : undefined;
      return { id, name: typeof displayName === 'string' ? displayName : id, description };
    })
    .filter((model): model is ModelResult => Boolean(model))
    .filter((model, index, all) => all.findIndex((item) => item.id === model.id) === index)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function providerError(providerName: string, status: number, authenticationFailure: boolean) {
  if (authenticationFailure) return `This API key was rejected by ${providerName}. Check that the key is active and belongs to this provider.`;
  if (status === 403) return `The key is valid, but it does not have access to ${providerName}'s Models API. Check its API restrictions and project access.`;
  if (status === 429) return `${providerName} accepted the connection, but the account is currently rate-limited or needs billing capacity.`;
  return `${providerName} returned an error while loading models. Try again in a moment.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ModelsRequest;
    const provider = body.provider;
    const apiKey = body.apiKey?.trim();

    if (!provider || !['openai', 'anthropic', 'gemini', 'custom'].includes(provider)) {
      return Response.json({ code: 'INVALID_PROVIDER', error: 'Choose a supported API provider.' }, { status: 400 });
    }
    if (!apiKey || apiKey.length > 1000) {
      return Response.json({ code: 'INVALID_KEY', error: 'Enter an API key before loading models.' }, { status: 400 });
    }

    let providerName: string;
    let endpoint: string;
    let authenticationHeaders: HeadersInit;

    if (provider === 'custom') {
      const baseUrl = body.baseUrl?.trim();
      const modelsPath = body.modelsPath?.trim() || '/models';
      if (!baseUrl || baseUrl.length > 500 || modelsPath.length > 200) {
        return Response.json({ code: 'INVALID_ENDPOINT', error: 'Enter a valid provider URL and models path.' }, { status: 400 });
      }
      endpoint = createCustomTarget(baseUrl, modelsPath);
      providerName = 'Custom provider';
      if (body.authMethod === 'api-key') {
        const headerName = body.headerName?.trim() || 'x-api-key';
        if (!/^[A-Za-z0-9-]{1,80}$/.test(headerName)) {
          return Response.json({ code: 'INVALID_HEADER', error: 'Enter a valid API key header name.' }, { status: 400 });
        }
        authenticationHeaders = { [headerName]: apiKey };
      } else {
        authenticationHeaders = { Authorization: `Bearer ${apiKey}` };
      }
    } else {
      const configuration = providerConfigurations[provider];
      providerName = configuration.name;
      endpoint = configuration.endpoint;
      authenticationHeaders = configuration.createHeaders(apiKey);
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json', ...authenticationHeaders },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return Response.json({
        code: 'PROVIDER_UNREACHABLE',
        error: `Arclane could not reach ${providerName}. Check the internet connection and try again.`,
      }, { status: 503 });
    }

    if (response.status >= 300 && response.status < 400) {
      return Response.json({
        code: 'UNEXPECTED_REDIRECT',
        error: `${providerName} redirected the Models API request. Check the provider endpoint.`,
      }, { status: 502 });
    }

    if (!response.ok) {
      const authenticationFailure = response.status === 401 || (provider === 'gemini' && response.status === 400);
      return Response.json({
        code: authenticationFailure ? 'PROVIDER_AUTH' : `PROVIDER_${response.status}`,
        error: providerError(providerName, response.status, authenticationFailure),
      }, { status: authenticationFailure ? 401 : response.status === 403 || response.status === 429 ? response.status : 502 });
    }

    const payload = await response.json().catch(() => null);
    const models = readModelList(payload, provider);
    if (models.length === 0) {
      return Response.json({
        code: 'NO_MODELS',
        error: `${providerName} verified the key, but returned no compatible generation models.`,
      }, { status: 422 });
    }

    return Response.json({ provider: providerName, models }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNSAFE_ENDPOINT') {
      return Response.json({ code: 'UNSAFE_ENDPOINT', error: 'Custom providers must use a public HTTPS endpoint.' }, { status: 400 });
    }
    return Response.json({ code: 'INVALID_REQUEST', error: 'The model request could not be processed.' }, { status: 400 });
  }
}
