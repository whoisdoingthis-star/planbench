// Locks a Planbench project file with a random key so it can sit on the public site
// without anyone being able to read it, and prints the private link that opens it.
//
//   node scripts/seal-project.mjs "path/to/Our kitchen.planbench.json"
//
// The key is only ever in the link (after the #), which browsers do not send to the server.
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const source = process.argv[2];
if (!source) {
  console.error('Give the path of a project file to seal.');
  process.exit(1);
}
const key = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([cipher.update(readFileSync(source)), cipher.final()]);
const id = randomBytes(8).toString('hex');
const dir = new URL('../public/shared/', import.meta.url);
mkdirSync(dir, { recursive: true });
// Layout of the file: 12 bytes of nonce, then the locked data, then the 16-byte check tag.
writeFileSync(new URL(`${id}.bin`, dir), Buffer.concat([iv, body, cipher.getAuthTag()]));
console.log(`Sealed as public/shared/${id}.bin`);
console.log(`Private link ending: #open=${id}.${key.toString('base64url')}`);
