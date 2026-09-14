// Upload validation for avatars: the multipart mimetype is only the client's
// claim, so a mislabelled or truncated upload would otherwise be stored and then
// fail to decode. See docs/avatar-system.md (Failure modes).

// The allowed MIME types and their magic-byte signatures. WebP needs two checks
// (RIFF....WEBP). The MIME_SIGNATURES keys are the whitelist — an unknown MIME has no
// entry and is rejected by `isImageSignatureValid`.
type SignatureCheck = [number, number[]];

const MIME_SIGNATURES: Record<string, SignatureCheck[] | undefined> = {
  'image/png': [[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]],
  'image/jpeg': [[0, [0xff, 0xd8, 0xff]]],
  'image/gif': [[0, [0x47, 0x49, 0x46, 0x38]]],
  'image/webp': [
    [0, [0x52, 0x49, 0x46, 0x46]],
    [8, [0x57, 0x45, 0x42, 0x50]],
  ],
};

function matches(buffer: Buffer, offset: number, expected: number[]): boolean {
  if (buffer.length < offset + expected.length) return false;
  return expected.every((byte, i) => buffer[offset + i] === byte);
}

// True when the buffer's leading bytes match the declared image type.
export function isImageSignatureValid(buffer: Buffer, contentType: string): boolean {
  const checks = MIME_SIGNATURES[contentType];
  if (!checks) return false;
  return checks.every(([offset, expected]) => matches(buffer, offset, expected));
}

// Combined check: MIME is in the whitelist AND the bytes match its signature.
export function isImageValid(buffer: Buffer, contentType: string): boolean {
  return (
    Object.keys(MIME_SIGNATURES).includes(contentType) && isImageSignatureValid(buffer, contentType)
  );
}
