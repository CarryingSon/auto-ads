import { google } from 'googleapis';

const SERVICE_ACCOUNT_EMAIL = 'drivetoads@practical-scion-483209-t7.iam.gserviceaccount.com';

let cachedClient: ReturnType<typeof google.drive> | null = null;

function getServiceAccountCredentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
  }

  const trimmed = raw.trim();

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('Invalid service account key: missing client_email or private_key');
    }
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }

  let privateKey = trimmed;
  if (!privateKey.startsWith('-----BEGIN')) {
    const cleanBase64 = privateKey.replace(/\s/g, '');
    const lines = cleanBase64.match(/.{1,64}/g) || [];
    const header = `-----BEGIN ${'PRIVATE KEY'}-----`;
    const footer = `-----END ${'PRIVATE KEY'}-----`;
    privateKey = `${header}\n${lines.join('\n')}\n${footer}\n`;
  }

  return {
    client_email: SERVICE_ACCOUNT_EMAIL,
    private_key: privateKey,
  };
}

export function getServiceAccountEmail(): string {
  return SERVICE_ACCOUNT_EMAIL;
}

export function isServiceAccountConfigured(): boolean {
  try {
    getServiceAccountCredentials();
    return true;
  } catch {
    return false;
  }
}

async function getDriveClient() {
  if (cachedClient) return cachedClient;

  const creds = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  cachedClient = google.drive({ version: 'v3', auth });
  return cachedClient;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  files: DriveFile[];
  docxFile?: DriveFile;
}

export function extractFolderIdFromUrl(url: string): string | null {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/drive\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function checkFolderAccess(folderId: string): Promise<boolean> {
  try {
    await getFolderName(folderId);
    return true;
  } catch {
    return false;
  }
}

export async function getFolderName(folderId: string): Promise<string | null> {
  const drive = await getDriveClient();
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'name',
      supportsAllDrives: true,
    });
    return response.data.name || null;
  } catch (err: any) {
    console.error('[ServiceAccount] Failed to get folder name:', err?.message || err);
    throw err;
  }
}

export async function listFolderContents(folderId: string): Promise<DriveFile[]> {
  const drive = await getDriveClient();
  console.log('[ServiceAccount] Listing folder:', folderId);

  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    if (response.data.files) {
      allFiles.push(...(response.data.files as DriveFile[]));
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  console.log('[ServiceAccount] Found files:', allFiles.length);
  return allFiles;
}

export async function listDCTFolders(rootFolderId: string): Promise<DriveFolder[]> {
  const drive = await getDriveClient();
  console.log('[ServiceAccount] Listing DCT folders in:', rootFolderId);

  const foldersResponse = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    orderBy: 'name',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const folders = foldersResponse.data.files || [];
  console.log('[ServiceAccount] Found folders:', folders.length);

  const dctFolders = folders.filter((f: any) =>
    f.name.toLowerCase().startsWith('dct')
  );
  console.log('[ServiceAccount] DCT folders:', dctFolders.length);

  const result: DriveFolder[] = [];
  for (const folder of dctFolders) {
    const files = await listFolderContents(folder.id!);
    const docxFile = files.find(f =>
      f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.mimeType === 'application/vnd.google-apps.document' ||
      f.name.endsWith('.docx')
    );
    result.push({
      id: folder.id!,
      name: folder.name!,
      files: files.filter(f =>
        !f.name.endsWith('.docx') &&
        f.mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        f.mimeType !== 'application/vnd.google-apps.document'
      ),
      docxFile,
    });
  }

  return result;
}

export async function getGlobalDocx(rootFolderId: string): Promise<DriveFile | null> {
  const files = await listFolderContents(rootFolderId);
  return files.find(f =>
    f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    f.mimeType === 'application/vnd.google-apps.document' ||
    f.name.endsWith('.docx')
  ) || null;
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = await getDriveClient();
  console.log('[ServiceAccount] Downloading file:', fileId);

  const metadata = await drive.files.get({
    fileId,
    fields: 'mimeType',
    supportsAllDrives: true,
  });

  if (metadata.data.mimeType === 'application/vnd.google-apps.document') {
    const response = await drive.files.export({
      fileId,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }, {
      responseType: 'arraybuffer',
    });
    const buffer = Buffer.from(response.data as ArrayBuffer);
    console.log('[ServiceAccount] Exported Google Doc, size:', buffer.length);
    return buffer;
  }

  const response = await drive.files.get({
    fileId,
    alt: 'media',
    supportsAllDrives: true,
  }, {
    responseType: 'arraybuffer',
  });

  const buffer = Buffer.from(response.data as ArrayBuffer);
  console.log('[ServiceAccount] Downloaded file size:', buffer.length);
  return buffer;
}

export async function getFileMetadata(fileId: string): Promise<DriveFile | null> {
  const drive = await getDriveClient();
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
      supportsAllDrives: true,
    });
    return response.data as DriveFile;
  } catch (err: any) {
    console.error('[ServiceAccount] Failed to get file metadata:', err?.message || err);
    return null;
  }
}

export async function checkFileReadable(fileId: string): Promise<boolean> {
  try {
    const drive = await getDriveClient();
    const response = await drive.files.get({
      fileId,
      alt: 'media',
      supportsAllDrives: true,
    }, {
      responseType: 'stream',
      headers: { Range: 'bytes=0-0' },
    });
    if (response.data) {
      response.data.destroy();
    }
    return true;
  } catch (err: any) {
    console.log('[ServiceAccount] File not readable:', fileId, err?.message || err);
    return false;
  }
}

export function getFileType(mimeType: string, filename: string): "video" | "image" | "document" | "unknown" {
  if (mimeType.startsWith('video/')) return "video";
  if (mimeType.startsWith('image/')) return "image";
  if (mimeType.includes('document') || mimeType === 'application/vnd.google-apps.document' || filename.endsWith('.docx')) return "document";

  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return "unknown";

  const videoExts = ['mp4', 'mov', 'avi', 'webm', 'm4v'];
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const docExts = ['docx', 'doc'];

  if (videoExts.includes(ext)) return "video";
  if (imageExts.includes(ext)) return "image";
  if (docExts.includes(ext)) return "document";
  return "unknown";
}

export async function browseFolders(folderId: string): Promise<{ id: string; name: string; mimeType: string }[]> {
  const drive = await getDriveClient();

  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []) as { id: string; name: string; mimeType: string }[];
}

export async function searchFolders(query: string): Promise<{ id: string; name: string; mimeType: string }[]> {
  const drive = await getDriveClient();

  const response = await drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name, mimeType)',
    orderBy: 'name',
    pageSize: 20,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (response.data.files || []) as { id: string; name: string; mimeType: string }[];
}
