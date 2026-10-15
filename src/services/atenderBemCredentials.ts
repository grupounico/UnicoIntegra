export function sameCredentialUrl(saved: string | undefined, current: string): boolean {
  if (!saved || !current) return false;
  try { return new URL(saved).toString() === new URL(current).toString(); }
  catch { return false; }
}

export function credentialPlaceholder(saved: boolean): string {
  return saved ? 'Chave salva no servidor • deixe vazio para manter' : 'Informe a chave';
}
