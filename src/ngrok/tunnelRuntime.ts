/** Public HTTPS URL from the active @ngrok/ngrok listener (set after forward()). */
let tunnelPublicUrl: string | null = null;

export function setTunnelPublicUrl(url: string | null): void {
  tunnelPublicUrl = url;
}

export function getTunnelPublicUrl(): string {
  return tunnelPublicUrl ?? '';
}
