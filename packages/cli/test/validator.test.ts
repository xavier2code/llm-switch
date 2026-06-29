import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateAnthropic, validateOpenAi } from '@llm-switch/core/validator.js';
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
    await expect(validateAnthropic('https://x.example.com', 'm', 'key')).resolves.toBeUndefined();
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
    mockFetch.mockResolvedValue(makeResponse({ status: 401, body: 'bad key' }));
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
    await expect(validateAnthropic('https://x', 'm', 'k', { timeoutMs: 50 })).rejects.toThrowError(
      /timed out after 50ms/,
    );
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

  describe('HTTPS enforcement', () => {
    it('rejects http:// to a non-localhost host with an HTTPS-specific error', async () => {
      await expect(validateAnthropic('http://api.example.com', 'm', 'k')).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(validateAnthropic('http://api.example.com', 'm', 'k')).rejects.toThrowError(
        /HTTPS/,
      );
    });

    it('does not call fetch when BASE_URL is rejected as insecure', async () => {
      await expect(validateAnthropic('http://api.example.com', 'm', 'k')).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects http:// to a public-looking IP with an HTTPS-specific error', async () => {
      await expect(validateAnthropic('http://8.8.8.8', 'm', 'k')).rejects.toThrowError(/HTTPS/);
    });

    it('rejects URLs that cannot be parsed', async () => {
      await expect(validateAnthropic('not a url', 'm', 'k')).rejects.toThrowError(/HTTPS/);
    });

    it('rejects empty string', async () => {
      await expect(validateAnthropic('', 'm', 'k')).rejects.toThrowError(/HTTPS/);
    });

    it('accepts http://localhost (local proxy exception)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
      await expect(validateAnthropic('http://localhost:11434', 'm', 'k')).resolves.toBeUndefined();
    });

    it('accepts http://127.0.0.1 (IPv4 localhost exception)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
      await expect(validateAnthropic('http://127.0.0.1:8080', 'm', 'k')).resolves.toBeUndefined();
    });

    it('accepts http://[::1] (IPv6 localhost exception)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
      await expect(validateAnthropic('http://[::1]:8080', 'm', 'k')).resolves.toBeUndefined();
    });

    it('accepts https://localhost (https + localhost is fine)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200 }));
      await expect(validateAnthropic('https://localhost:11434', 'm', 'k')).resolves.toBeUndefined();
    });
  });
});

describe('validateOpenAi', () => {
  it('rejects (throws) on a 401 response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    await expect(validateOpenAi('https://api.openai.com/v1', 'gpt-4.1', 'sk-bad')).rejects.toThrow(
      ValidationError,
    );
    await expect(validateOpenAi('https://api.openai.com/v1', 'gpt-4.1', 'sk-bad')).rejects.toThrow(
      /Invalid API key/,
    );
  });

  it('rejects on a non-401/403 error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    await expect(validateOpenAi('https://api.openai.com/v1', 'gpt-4.1', 'sk-bad')).rejects.toThrow(
      /Provider rejected request \(500\)/,
    );
  });

  it('rejects non-HTTPS base URLs', async () => {
    await expect(validateOpenAi('http://example.com/v1', 'gpt-4.1', 'sk-bad')).rejects.toThrow(
      /BASE_URL must use HTTPS/,
    );
  });

  it('wraps network errors in ValidationError', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(validateOpenAi('https://api.openai.com/v1', 'gpt-4.1', 'sk-bad')).rejects.toThrow(
      /Network error/,
    );
  });

  it('wraps timeout errors in ValidationError', async () => {
    mockFetch.mockImplementation(() => {
      const err = new Error('timeout');
      (err as { name: string }).name = 'AbortError';
      return Promise.reject(err);
    });
    await expect(
      validateOpenAi('https://api.openai.com/v1', 'gpt-4.1', 'sk-bad', { timeoutMs: 1 }),
    ).rejects.toThrow(/Validation timed out/);
  });
});
