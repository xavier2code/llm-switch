import { z } from 'zod';

export const SettingsSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
    mcpServers: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type Settings = z.infer<typeof SettingsSchema>;

export function parseSettings(json: string): Settings {
  const raw = JSON.parse(json);
  return SettingsSchema.parse(raw);
}

export function parseSettingsSafe(json: string): Settings | null {
  try {
    return parseSettings(json);
  } catch {
    return null;
  }
}
