// Operator authorization is kept only in memory and never bundled or persisted.
let adminKey = '';
export function getAtenderBemAdminKey() { return adminKey; }
export function setAtenderBemAdminKey(value: string) { adminKey = value.trim(); }
export function atenderBemHeaders() {
  if (!adminKey) throw new Error('Informe a chave administrativa na configuração do AtenderBem.');
  return { 'X-API-Key': adminKey };
}
