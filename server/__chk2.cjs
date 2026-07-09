function sanitizeForComment(s) {
  return String(s ?? '')
    .replace(/\*\//g, '* /')
    .replace(/\/\*/g, '/ *')
    .replace(/[\r\n]/g, ' ');
}
const evil = 'evil */ var __PWNED__ = 1; /*';
const sanitized = sanitizeForComment(evil);
console.log('sanitized:', JSON.stringify(sanitized));
console.log('injected breakout neutralized:', !sanitized.includes('*/') && !sanitized.includes('/*'));
console.log('would a raw */ in comment still break out?:', sanitized.includes('*/'));
