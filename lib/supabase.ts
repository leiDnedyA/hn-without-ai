type SupabaseConfig = { url: string; key: string };

function getConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/** Minimal server-only Supabase REST client, avoiding a browser-capable SDK. */
export async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  const config = getConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status}: ${await response.text()}`);
  }

  if (response.status === 204) return null;
  return (await response.json()) as T;
}
