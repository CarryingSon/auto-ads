import crypto from "crypto";
import { db } from "./server/db";
import { oauthConnections } from "./shared/schema";
import { eq } from "drizzle-orm";

const TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY || process.env.SESSION_SECRET;

function decrypt(encryptedText: string): string {
  if (!TOKEN_ENC_KEY) throw new Error("Encryption key not configured");
  try {
    const parts = encryptedText.split(':');
    if (parts.length === 3) {
      const [ivHex, encrypted, authTagHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const key = crypto.scryptSync(TOKEN_ENC_KEY, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    return encryptedText;
  } catch {
    return encryptedText;
  }
}

async function checkToken() {
  const connections = await db.select().from(oauthConnections).where(eq(oauthConnections.provider, 'meta'));
  console.log('Found', connections.length, 'Meta connections');
  
  for (const conn of connections) {
    console.log('\nConnection:', conn.id, '- userId:', conn.userId);
    const token = decrypt(conn.accessToken || '');
    console.log('Token (first 20 chars):', token.substring(0, 20) + '...');
    
    // Test the token
    const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);
    const data = await res.json();
    console.log('Token test:', data.id ? `Valid - ${data.name}` : `Invalid - ${data.error?.message}`);
    
    // Test ads_read permission
    const adsRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?access_token=${token}`);
    const adsData = await adsRes.json();
    console.log('Ads access:', adsData.data ? `Valid - ${adsData.data.length} accounts` : `Invalid - ${adsData.error?.message}`);
  }
}

checkToken().catch(console.error);
