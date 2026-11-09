// CloudflareBindings is ambient from worker-configuration.d.ts (wrangler types).
export interface UserRow {
  id: string;
  splitwise_user_id: string;
  encrypted_access_token: string;
  token_expiry: number | null;
}

export type AppEnv = {
  Bindings: CloudflareBindings;
  Variables: { user: UserRow };
};
