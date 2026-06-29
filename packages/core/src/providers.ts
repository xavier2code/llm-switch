import { AppError } from './errors.js';

export type ProviderId = 'glm' | 'deepseek' | 'kimi' | 'minimax' | 'qwen' | 'openai';

export type ProviderFamily = 'anthropic' | 'openai';

export interface Provider {
  id: ProviderId;
  displayName: string;
  family: ProviderFamily;
  baseUrl: string;
  defaultModel: string;
}

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'glm',
    displayName: 'GLM (智谱)',
    family: 'anthropic',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    defaultModel: 'glm-4.5',
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    family: 'anthropic',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'kimi',
    displayName: 'Kimi (Moonshot)',
    family: 'anthropic',
    baseUrl: 'https://api.kimi.com/coding/',
    defaultModel: 'kimi-for-coding',
  },
  {
    id: 'minimax',
    displayName: 'MiniMax',
    family: 'anthropic',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    defaultModel: 'MiniMax-Text-01',
  },
  {
    id: 'qwen',
    displayName: 'Qwen (DashScope)',
    family: 'anthropic',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/anthropic',
    defaultModel: 'qwen-plus',
  },
  {
    id: 'openai',
    displayName: 'OpenAI',
    family: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
  },
];

const BY_ID: Record<ProviderId, Provider> = (() => {
  const map: Partial<Record<ProviderId, Provider>> = {};
  for (const p of PROVIDERS) map[p.id] = p;
  return map as Record<ProviderId, Provider>;
})();

const PROVIDER_IDS: readonly string[] = PROVIDERS.map((p) => p.id);

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

export function getProvider(id: ProviderId): Provider {
  const p = BY_ID[id];
  if (!p) {
    throw new AppError(`Unknown provider '${id}'`, 'UNKNOWN_PROVIDER');
  }
  return p;
}
