import { google } from 'googleapis';
import { db } from './db.js';
import { oauthConnections } from '../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { decrypt } from './auth-routes.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

async function getGoogleTokenForUser(userId: string): Promise<{ accessToken: string; refreshToken?: string }> {
  const connection = await db.select()
    .from(oauthConnections)
    .where(and(
      eq(oauthConnections.userId, userId),
      eq(oauthConnections.provider, "google")
    ))
    .limit(1);

  if (!connection.length || !connection[0].accessToken) {
    throw new Error('Google Drive not connected - please connect Google Drive in Settings');
  }

  const accessToken = decrypt(connection[0].accessToken);
  const refreshToken = connection[0].refreshToken ? decrypt(connection[0].refreshToken) : undefined;
  const expiresAt = connection[0].tokenExpiresAt;

  if (expiresAt && new Date(expiresAt).getTime() < Date.now() && refreshToken) {
    console.log('[GoogleDriveOAuth] Token expired, refreshing...');
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.access_token) {
        const { encrypt } = await import('./auth-routes.js');
        const newExpiresAt = tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null;

        await db.update(oauthConnections)
          .set({
            accessToken: encrypt(tokenData.access_token),
            tokenExpiresAt: newExpiresAt,
            updatedAt: new Date(),
          })
          .where(eq(oauthConnections.id, connection[0].id));

        console.log('[GoogleDriveOAuth] Token refreshed successfully');
        return { accessToken: tokenData.access_token, refreshToken };
      } else {
        console.error('[GoogleDriveOAuth] Refresh failed - no access_token in response:', JSON.stringify(tokenData));
      }
    } catch (err) {
      console.error('[GoogleDriveOAuth] Token refresh failed:', err);
    }
  }

  return { accessToken, refreshToken };
}

export async function getConnectedEmail(userId: string): Promise<string | null> {
  try {
    const connection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "google")
      ))
      .limit(1);

    if (connection.length > 0 && connection[0].status === "connected") {
      return connection[0].accountEmail || null;
    }
    return null;
  } catch (err) {
    console.error('[GoogleDriveOAuth] Failed to get connected email:', err);
    return null;
  }
}

export async function isGoogleConnected(userId: string): Promise<boolean> {
  try {
    const connection = await db.select()
      .from(oauthConnections)
      .where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, "google")
      ))
      .limit(1);

    return connection.length > 0 && connection[0].status === "connected" && !!connection[0].accessToken;
  } catch {
    return false;
  }
}

export async function getDriveClientForUser(userId: string) {
  return getDriveClient(userId);
}

async function getDriveClient(userId: string) {
  const { accessToken } = await getGoogleTokenForUser(userId);
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
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

export async function listFolderContents(folderId: string, userId: string): Promise<DriveFile[]> {
  const drive = await getDriveClient(userId);
  
  console.log('[GoogleDriveOAuth] Listing folder:', folderId);
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size)',
    orderBy: 'name',
  });
  
  console.log('[GoogleDriveOAuth] Found files:', response.data.files?.length);
  return response.data.files as DriveFile[] || [];
}

export async function listDCTFolders(rootFolderId: string, userId: string): Promise<DriveFolder[]> {
  const drive = await getDriveClient(userId);
  
  console.log('[GoogleDriveOAuth] Listing DCT folders in:', rootFolderId);
  
  const foldersResponse = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    orderBy: 'name',
  });
  
  const folders = foldersResponse.data.files || [];
  console.log('[GoogleDriveOAuth] Found folders:', folders.length);
  
  const dctFolders = folders.filter((f: any) => 
    f.name.toLowerCase().startsWith('dct')
  );
  
  console.log('[GoogleDriveOAuth] DCT folders:', dctFolders.length);
  
  const result: DriveFolder[] = [];
  for (const folder of dctFolders) {
    const files = await listFolderContents(folder.id!, userId);
    const docxFile = files.find(f => 
      f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.name.endsWith('.docx')
    );
    result.push({
      id: folder.id!,
      name: folder.name!,
      files: files.filter(f => !f.name.endsWith('.docx')),
      docxFile,
    });
  }
  
  return result;
}

export async function getGlobalDocx(rootFolderId: string, userId: string): Promise<DriveFile | null> {
  const files = await listFolderContents(rootFolderId, userId);
  return files.find(f => 
    f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    f.name.endsWith('.docx')
  ) || null;
}

export async function downloadFile(fileId: string, userId: string): Promise<Buffer> {
  const drive = await getDriveClient(userId);
  
  console.log('[GoogleDriveOAuth] Downloading file:', fileId);
  
  const response = await drive.files.get({
    fileId,
    alt: 'media',
  }, {
    responseType: 'arraybuffer',
  });
  
  const buffer = Buffer.from(response.data as ArrayBuffer);
  console.log('[GoogleDriveOAuth] Downloaded file size:', buffer.length);
  return buffer;
}

export async function getFileMetadata(fileId: string, userId: string): Promise<DriveFile | null> {
  const drive = await getDriveClient(userId);
  
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
    });
    return response.data as DriveFile;
  } catch (err) {
    console.error('[GoogleDriveOAuth] Failed to get file metadata:', err);
    return null;
  }
}

export async function getFolderName(folderId: string, userId: string): Promise<string | null> {
  const drive = await getDriveClient(userId);
  
  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'name',
    });
    return response.data.name || null;
  } catch (err) {
    console.error('[GoogleDriveOAuth] Failed to get folder name:', err);
    return null;
  }
}

export async function checkFolderAccess(folderId: string, userId: string): Promise<boolean> {
  try {
    await getFolderName(folderId, userId);
    return true;
  } catch (err) {
    return false;
  }
}

export function extractFolderIdFromUrl(url: string): string | null {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/drive\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export function getFileType(mimeType: string, filename: string): "video" | "image" | "document" | "unknown" {
  if (mimeType.startsWith('video/')) return "video";
  if (mimeType.startsWith('image/')) return "image";
  if (mimeType.includes('document') || filename.endsWith('.docx')) return "document";
  
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
