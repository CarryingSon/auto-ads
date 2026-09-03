function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is not configured");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  if (!bucket) {
    throw new Error("SUPABASE_STORAGE_BUCKET is not configured");
  }

  return { supabaseUrl, serviceRoleKey, bucket };
}

export const SUPABASE_STORAGE_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
] as const;

/** Names of the storage variables that are unset or empty, for actionable error messages. */
export function getMissingSupabaseStorageConfig(): string[] {
  return SUPABASE_STORAGE_ENV_KEYS.filter((key) => !process.env[key]?.trim());
}

export interface SupabaseStorageCheck {
  configured: boolean;
  missing: string[];
  bucket?: string;
  reachable?: boolean;
  status?: number;
  error?: string;
}

/** Diagnostics: confirms the credentials actually authenticate against the bucket. */
export async function checkSupabaseStorage(): Promise<SupabaseStorageCheck> {
  const missing = getMissingSupabaseStorageConfig();
  if (missing.length > 0) {
    return { configured: false, missing };
  }

  const { supabaseUrl, serviceRoleKey, bucket } = getSupabaseConfig();
  try {
    const response = await fetch(`${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
      headers: getAuthHeaders(serviceRoleKey),
    });
    if (response.ok) {
      return { configured: true, missing: [], bucket, reachable: true, status: response.status };
    }
    const body = await response.text().catch(() => "");
    return {
      configured: true,
      missing: [],
      bucket,
      reachable: false,
      status: response.status,
      error: body.slice(0, 300) || response.statusText,
    };
  } catch (error: any) {
    return {
      configured: true,
      missing: [],
      bucket,
      reachable: false,
      error: error?.message || String(error),
    };
  }
}

function encodeObjectPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getAuthHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
  };
}

export async function uploadBufferToSupabaseStorage(params: {
  objectPath: string;
  contentType: string;
  buffer: Buffer;
}): Promise<void> {
  const { supabaseUrl, serviceRoleKey, bucket } = getSupabaseConfig();
  const encodedPath = encodeObjectPath(params.objectPath);
  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...getAuthHeaders(serviceRoleKey),
      "Content-Type": params.contentType,
      "x-upsert": "true",
    },
    body: params.buffer,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Supabase upload failed (${response.status}): ${body || response.statusText}`);
  }
}

export async function createSignedSupabaseDownloadUrl(params: {
  objectPath: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { supabaseUrl, serviceRoleKey, bucket } = getSupabaseConfig();
  const encodedPath = encodeObjectPath(params.objectPath);
  const expiresIn = params.expiresInSeconds ?? 3600;

  const url = `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...getAuthHeaders(serviceRoleKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Supabase signed URL failed (${response.status}): ${body || response.statusText}`);
  }

  const data = (await response.json()) as { signedURL?: string; signedUrl?: string };
  const signedPath = data.signedURL || data.signedUrl;
  if (!signedPath) {
    throw new Error("Supabase signed URL response missing signedURL");
  }

  if (/^https?:\/\//i.test(signedPath)) {
    return signedPath;
  }

  const prefix = signedPath.startsWith("/storage/v1")
    ? ""
    : "/storage/v1";
  return `${supabaseUrl}${prefix}${signedPath}`;
}
