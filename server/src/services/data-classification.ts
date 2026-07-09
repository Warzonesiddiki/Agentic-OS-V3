/** data-classification.ts — classify data sensitivity (public/internal/confidential/restricted). */
export type DataClass = 'public' | 'internal' | 'confidential' | 'restricted';

const RESTRICTED = [
  /(?:ssn|social security)/i,
  /password/i,
  /secret/i,
  /private key/i,
  /health record/i,
  /pci/i,
];
const CONFIDENTIAL = [/email/i, /phone/i, /address/i, /financial/i, /customer/i, /pii/i];
const INTERNAL = [/internal/i, /draft/i, /roadmap/i, /salary/i];

export function classify(text: string): DataClass {
  if (RESTRICTED.some((r) => r.test(text))) return 'restricted';
  if (CONFIDENTIAL.some((r) => r.test(text))) return 'confidential';
  if (INTERNAL.some((r) => r.test(text))) return 'internal';
  return 'public';
}

export function requiredControls(cls: DataClass): string[] {
  switch (cls) {
    case 'restricted':
      return ['encrypt-at-rest', 'encrypt-in-transit', 'dlp', 'access-approval'];
    case 'confidential':
      return ['encrypt-in-transit', 'dlp'];
    case 'internal':
      return ['access-logging'];
    default:
      return [];
  }
}
