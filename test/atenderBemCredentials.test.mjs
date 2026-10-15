import test from 'node:test';
import assert from 'node:assert/strict';
import { sameCredentialUrl, credentialPlaceholder } from '../src/services/atenderBemCredentials.ts';
test('explicit HTTPS port does not make a persisted MCP key look missing', () => {
  assert.equal(sameCredentialUrl('https://drogasara.atenderbem.com/mcp', 'https://drogasara.atenderbem.com:443/mcp'), true);
});
test('changed or absent destination requires a new credential', () => {
  assert.equal(sameCredentialUrl(undefined, 'https://drogasara.atenderbem.com/mcp'), false);
  assert.equal(sameCredentialUrl('https://unicodev.atenderbem.com/mcp','https://drogasara.atenderbem.com/mcp'), false);
});
test('saved credential placeholder communicates preservation without a secret value', () => {
  assert.match(credentialPlaceholder(true), /salva.*vazio para manter/);
  assert.equal(credentialPlaceholder(false), 'Informe a chave');
});
