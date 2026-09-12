export function buildGameInvitationUrl(origin: string, roomCode: string): string {
  return new URL(`/${roomCode}`, origin).toString();
}

export function buildWhatsAppInvitationUrl(invitationUrl: string, roomCode: string): string {
  const message = `Sumate a mi partida de Teléfono Descompuesto. Código ${roomCode}: ${invitationUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
