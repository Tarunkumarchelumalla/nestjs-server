import { privateDecrypt, constants } from 'crypto';

/**
 * Decrypts a base64-encoded RSA-encrypted string using the server's private key.
 *
 * Client side (encryption):
 *   const encrypted = crypto.publicEncrypt(
 *     { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
 *     Buffer.from(plaintext),
 *   );
 *   const base64Payload = encrypted.toString('base64');
 *
 * Server side (decryption) — handled here automatically.
 *
 * Requires env var:
 *   RSA_PRIVATE_KEY — PEM private key with literal \n characters
 *   e.g.  RSA_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
 */
export function decryptRsa(encryptedBase64: string): string {
  const rawKey = process.env.RSA_PRIVATE_KEY;

  if (!rawKey) {
    throw new Error('RSA_PRIVATE_KEY is not set in environment variables');
  }

  // Support both real newlines and escaped \n stored in .env
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

  const decrypted = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    encryptedBuffer,
  );

  return decrypted.toString('utf8');
}
