/**
 * Simple Base64 + salt obfuscation for API keys.
 *
 * Client side (encode before sending):
 *   const encoded = btoa(SALT + apiKey);   // browser
 *   // or in Node:
 *   const encoded = Buffer.from(SALT + apiKey).toString('base64');
 *
 * Server side (decoded here automatically).
 *
 * Requires env var:
 *   API_KEY_SALT — shared secret salt, e.g.  API_KEY_SALT=mySecretSalt123
 */
export function decryptApiKey(encodedApiKey: string): string {
  const salt = process.env.API_KEY_SALT;

  if (!salt) {
    throw new Error('API_KEY_SALT is not set in environment variables');
  }

  const decoded = Buffer.from(encodedApiKey, 'base64').toString('utf8');

  if (!decoded.startsWith(salt)) {
    throw new Error('Invalid apiKey: salt mismatch');
  }

  return decoded.slice(salt.length);
}
