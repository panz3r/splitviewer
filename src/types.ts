// CloudflareBindings is ambient from worker-configuration.d.ts (wrangler types).
import type { Lang } from "./i18n";

export interface UserRow {
  id: string;
  splitwise_user_id: string;
  encrypted_access_token: string;
  token_expiry: number | null;
  avatar_url: string | null;
  first_name: string | null;
}

export type AppEnv = {
  Bindings: CloudflareBindings;
  Variables: { user: UserRow; lang: Lang };
};
