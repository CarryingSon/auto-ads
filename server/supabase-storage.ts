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
