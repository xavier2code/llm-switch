import { AppError } from './errors.js';

export type ProviderId = 'glm' | 'deepseek' | 'kimi' | 'minimax' | 'qwen';

export interface Provider {
  id: ProviderId;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
}

export const PROVIDERS: readonly Provider[] = [
  { id: 'glm',      displayName: 'GLM (智谱)',      baseUrl: 'https://open.bigmodel.cn/api/anthropic',                 defaultModel: 'glm-4.5' },
  { id: 'deepseek', displayName: 'DeepSeek',         baseUrl: 'https://api.deepseek.com/anthropic',                     defaultModel: 'deepseek-chat' },
  { id: 'kimi',     displayName: 'Kimi (Moonshot)',  baseUrl: 'https://api.moonshot.cn/anthropic',                      defaultModel: 'moonshot-v1-8k' },
  { id: 'minimax',  displayName: 'MiniMax',          baseUrl: 'https://api.minimaxi.com/anthropic',                    defaultModel: 'MiniMax-Text-01' },
  { id: 'qwen',     displayName: 'Qwen (DashScope)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/anthropic', defaultModel: 'qwen-plus' },
];

const BY_ID: Record<ProviderId, Provider> = (() => {
  const map = {} as Record<ProviderId, Provider>;
  for (const p of PROVIDERS) map[p.id] = p;
  return map;
})();

export function getProvider(id: ProviderId): Provider {
  const p = BY_ID[id];
  if (!p) {
    throw new AppError(`Unknown provider '${id}'`, 'UNKNOWN_PROVIDER');
  }
  return p;
}
