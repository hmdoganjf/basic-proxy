/**
 * Reserved ngrok hostname from full dashboard URL (https://foo.ngrok-free.app → foo.ngrok-free.app).
 */
export function ngrokHttpsUrlToDomain(ngrokUrl: string): string {
  const u = new URL(ngrokUrl.startsWith('http') ? ngrokUrl : `https://${ngrokUrl}`);
  return u.hostname;
}
