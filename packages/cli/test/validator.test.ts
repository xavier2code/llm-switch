import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateAnthropic } from '../src/validator.js';
import { ValidationError } from '../src/errors.js';

type FetchResp = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

function makeResponse(opts: { status: number; body?: string }): FetchResp {
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    text: async () => opts.body ?? '',
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validateAnthropic', () => {
  it('returns on 2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
    await expect(
      validateAnthropic('https://x.example.com', 'm', 'key'),
    ).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('POSTs to {baseUrl}/v1/messages with Anthropic headers and minimal body', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
    await validateAnthropic('https://x.example.com/', 'glm-4.5', 'sk-abc');

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://x.example.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'x-api-key': 'sk-abc',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    });
    const body = JSON.parse(init.body);
    expect(body.model).toBe('glm-4.5');
    expect(body.max_tokens).toBe(1);
    expect(body.messages).toEqual([{ role: 'user', content: 'ping' }]);
  });

  it('throws ValidationError with 401 on unauthorized', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 401, body: 'bad key' }));
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(
      /Invalid API key \(401\)/,
    );
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError with 403 on forbidden', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 403 }));
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(/403/);
  });

  it('throws ValidationError with status and body on 5xx', async () => {
    const bodyText = 'X'.repeat(250);
    mockFetch.mockResolvedValue(makeResponse({ status: 500, body: bodyText }));
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(
      /Provider rejected request \(500\)/,
    );
    // body is truncated to 200 chars
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(
      new RegExp('X{200}'),
    );
  });

  it('throws ValidationError with timed out on AbortError', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    mockFetch.mockRejectedValueOnce(abortErr);
    await expect(
      validateAnthropic('https://x', 'm', 'k', { timeoutMs: 50 }),
    ).rejects.toThrowError(/timed out after 50ms/);
  });

  it('throws ValidationError with Network error on generic fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(validateAnthropic('https://x', 'm', 'k')).rejects.toThrowError(
      /Network error.*ENOTFOUND/,
    );
  });

  it('passes AbortSignal to fetch', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
    await validateAnthropic('https://x', 'm', 'k', { timeoutMs: 5000 });
    const init = mockFetch.mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
