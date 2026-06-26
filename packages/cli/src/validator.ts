import { ValidationError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const BODY_SNIPPET_LEN = 200;
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const HTTPS_REQUIRED_MSG =
  'BASE_URL must use HTTPS (HTTP is allowed only for localhost/127.0.0.1/::1).';

function assertSecureBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ValidationError(HTTPS_REQUIRED_MSG);
  }
  const isHttps = parsed.protocol === 'https:';
  const isLocalhostHttp =
    parsed.protocol === 'http:' && LOCALHOST_HOSTS.has(parsed.hostname.toLowerCase());
  if (!isHttps && !isLocalhostHttp) {
    throw new ValidationError(HTTPS_REQUIRED_MSG);
  }
}

export interface ValidateOptions {
  timeoutMs?: number;
}

export async function validateAnthropic(
  baseUrl: string,
  model: string,
  apiKey: string,
  opts?: ValidateOptions,
): Promise<void> {
  assertSecureBaseUrl(baseUrl);
  const url = `${baseUrl.replace(/\/$/, '')}/v1/messages`;
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      throw new ValidationError(`Invalid API key (${res.status}).`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const snippet = text.slice(0, BODY_SNIPPET_LEN);
      throw new ValidationError(`Provider rejected request (${res.status}): ${snippet}`);
    }
  } catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    const name = (err as { name?: string } | null)?.name;
    if (name === 'AbortError') {
      throw new ValidationError(`Validation timed out after ${timeoutMs}ms.`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new ValidationError(`Network error: ${msg}`, err);
  } finally {
    clearTimeout(timer);
  }
}

export async function validateOpenAi(
  baseUrl: string,
  model: string,
  apiKey: string,
): Promise<void> {
  assertSecureBaseUrl(baseUrl);
  const url = new URL('/chat/completions', baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown');
    throw new ValidationError(`OpenAI API error ${response.status}: ${text}`);
  }
}
