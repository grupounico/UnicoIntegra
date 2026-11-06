/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Check, CircleAlert, Clipboard, Loader2, PlugZap } from 'lucide-react';
import { API_BASE } from '../../services/api';
import { requireAuthSession } from '../../utils/authSession';
import { fieldClass, labelClass, secondaryButtonClass } from './catalogUi';
import type { Tone } from './catalogUi';

export type McpScope = 'catalog:read' | 'catalog:write' | 'database:test' | 'ai:create';
export type McpCredential = { id: string; name: string; scopes: McpScope[]; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null; createdAt: string };
export type Feedback = { tone: 'success' | 'error'; text: string } | null;

export const MCP_SCOPES: { value: McpScope; label: string; description: string; tools: string[] }[] = [
  { value: 'catalog:read', label: 'Consultar catálogo', description: 'Ver implantações, status e o guia do fluxo.', tools: ['catalog_workflow_guide', 'catalog_list_deployments', 'catalog_get_deployment'] },
  { value: 'catalog:write', label: 'Alterar catálogo', description: 'Criar, iniciar e repetir cargas; configurar e importar no AtenderBem.', tools: ['catalog_create_deployment', 'catalog_start_deployment', 'catalog_refresh_runs', 'catalog_retry_deployment', 'atenderbem_configure_unit', 'atenderbem_create_group', 'atenderbem_start_import', 'atenderbem_check_import'] },
  { value: 'database:test', label: 'Testar banco', description: 'Testar a conexão com o banco do ERP do cliente.', tools: ['catalog_test_database_connection'] },
  { value: 'ai:create', label: 'Criar IA', description: 'Criar a IA de catálogo ao final do fluxo.', tools: ['catalog_create_ai'] },
];
export const SCOPE_LABEL = Object.fromEntries(MCP_SCOPES.map(item => [item.value, item.label])) as Record<McpScope, string>;
export const TOKEN_PLACEHOLDER = '<SEU_TOKEN_MCP>';
const SERVER_NAME = 'unico-integra';

export function defaultMcpEndpoint() {
  return `${API_BASE.replace(/\/+$/, '')}/mcp/integra`;
}

export function isAllowedMcpEndpoint(value: string) {
  try {
    const url = new URL(value.trim());
    return !url.username && !url.password && !url.search && !url.hash
      && url.pathname.replace(/\/$/, '') === '/mcp/integra'
      && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
  } catch { return false; }
}

function networkMessage(error: unknown, target: string) {
  if (error instanceof TypeError) return `Não foi possível falar com ${target}. Verifique se o backend do Integra está no ar e se este endereço está liberado no CORS.`;
  return error instanceof Error ? error.message : 'Falha inesperada.';
}

// All calls to the Integra API go through here so network and HTTP errors read the same way.
export async function integraApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${requireAuthSession().authToken}`, ...init.headers } });
  } catch (error) { throw new Error(networkMessage(error, API_BASE)); }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) throw new Error(body?.message || `O servidor respondeu com HTTP ${response.status}.`);
  return body as T;
}

export function credentialStatus(item: McpCredential): { label: string; tone: Tone; active: boolean } {
  if (item.revokedAt) return { label: 'Revogado', tone: 'neutral', active: false };
  if (new Date(item.expiresAt) <= new Date()) return { label: 'Expirado', tone: 'warning', active: false };
  return { label: 'Ativo', tone: 'success', active: true };
}

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(value: string, target: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied(current => current === target ? null : current), 2000);
    } catch { window.prompt('Copie manualmente:', value); }
  }
  return { copied, copy };
}

export function Notice({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const success = feedback.tone === 'success';
  return <p role={success ? 'status' : 'alert'} className={`flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm leading-6 ${success ? 'border-emerald-200 text-emerald-900' : 'border-rose-200 bg-rose-50/60 text-rose-800'}`}>
    {success ? <Check className="mt-1 size-4 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-1 size-4 shrink-0 text-rose-600" />}<span>{feedback.text}</span>
  </p>;
}

export function CopyButton({ copied, onCopy, label }: { copied: boolean; onCopy: () => void; label: string }) {
  return <button type="button" onClick={onCopy} aria-label={label} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    {copied ? <Check className="size-3.5 text-emerald-600" /> : <Clipboard className="size-3.5" />}<span aria-live="polite" className="max-sm:sr-only">{copied ? 'Copiado' : 'Copiar'}</span>
  </button>;
}

export function SectionHeading({ id, title, description, action }: { id: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return <div className="flex items-end justify-between gap-3">
    <div className="min-w-0">
      <h2 id={id} className="text-[15px] font-semibold leading-7 text-slate-950">{title}</h2>
      {description ? <p className="mt-0.5 max-w-[68ch] text-sm leading-6 text-slate-600">{description}</p> : null}
    </div>
    {action}
  </div>;
}

type ClientTab = 'claude-code' | 'json' | 'url';
const CLIENT_TABS: { id: ClientTab; label: string; short: string }[] = [
  { id: 'claude-code', label: 'Claude Code', short: 'Terminal' },
  { id: 'json', label: 'Claude Desktop / Cursor', short: 'JSON' },
  { id: 'url', label: 'URL', short: 'URL' },
];

// Ready-to-paste configuration for the common MCP clients.
export function ClientConfig({ endpoint, token }: { endpoint: string; token: string }) {
  const [tab, setTab] = useState<ClientTab>('claude-code');
  const { copied, copy } = useCopy();
  const snippets = useMemo<Record<ClientTab, string>>(() => ({
    'claude-code': `claude mcp add --transport http ${SERVER_NAME} ${endpoint.trim()} --header "Authorization: Bearer ${token}"`,
    json: JSON.stringify({ mcpServers: { [SERVER_NAME]: { type: 'http', url: endpoint.trim(), headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
    url: endpoint.trim(),
  }), [endpoint, token]);

  return <div className="overflow-hidden rounded-lg border border-slate-200">
    <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 pl-1 pr-1.5">
      <div role="tablist" aria-label="Cliente de IA" className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">
        {CLIENT_TABS.map(item => {
          const selected = tab === item.id;
          return <button key={item.id} type="button" role="tab" id={`client-tab-${item.id}`} aria-selected={selected} aria-controls="client-panel" onClick={() => setTab(item.id)} className={`relative h-10 shrink-0 whitespace-nowrap px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-3 ${selected ? 'text-slate-950 after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary sm:after:inset-x-3' : 'text-slate-500 hover:text-slate-800'}`}><span className="sm:hidden">{item.short}</span><span className="max-sm:hidden">{item.label}</span></button>;
        })}
      </div>
      <CopyButton copied={copied === tab} onCopy={() => void copy(snippets[tab], tab)} label="Copiar configuração" />
    </div>
    <pre id="client-panel" role="tabpanel" aria-labelledby={`client-tab-${tab}`} className={`overflow-x-auto bg-white px-4 py-3.5 font-mono text-xs leading-5 text-slate-800 ${tab === 'json' ? '' : 'whitespace-pre-wrap [overflow-wrap:anywhere]'}`}>{snippets[tab]}</pre>
  </div>;
}

type TestResult = { server: string; usable: string[]; blocked: string[] };

// Runs initialize + tools/list against the MCP endpoint with the given token.
export function ConnectionTest({ initialToken = '', onTested }: { initialToken?: string; onTested?: () => void }) {
  const [endpoint, setEndpoint] = useState(defaultMcpEndpoint);
  const [token, setToken] = useState(initialToken);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const validEndpoint = isAllowedMcpEndpoint(endpoint);

  async function rpc(method: string, params: Record<string, unknown> = {}) {
    let response: Response;
    try {
      response = await fetch(endpoint.trim(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: `unico-integra-${method}`, method, params }),
      });
    } catch (error) { throw new Error(networkMessage(error, endpoint.trim())); }
    const body = await response.json().catch(() => null) as { result?: Record<string, unknown>; error?: { message?: string }; message?: string } | null;
    if (response.status === 401) throw new Error(body?.message || 'Token recusado: inválido, revogado ou expirado.');
    if (!response.ok || body?.error) throw new Error(body?.error?.message || body?.message || `O endpoint respondeu com HTTP ${response.status}.`);
    return body?.result ?? {};
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!validEndpoint) { setFeedback({ tone: 'error', text: 'Use uma URL HTTPS terminada em /mcp/integra. Em desenvolvimento, http://localhost também é aceito.' }); return; }
    if (!token.trim()) { setFeedback({ tone: 'error', text: 'Cole o token MCP para testar.' }); return; }
    setTesting(true); setFeedback(null); setResult(null);
    try {
      const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'unico-integra-web', version: '1.0.0' } }) as { serverInfo?: { name?: string } };
      const tools = ((await rpc('tools/list')) as { tools?: { name: string; description?: string }[] }).tools ?? [];
      const blocked = tools.filter(tool => tool.description?.startsWith('Indisponível')).map(tool => tool.name);
      const usable = tools.map(tool => tool.name).filter(name => !blocked.includes(name));
      setResult({ server: init.serverInfo?.name || 'MCP do Unico Integra', usable, blocked });
      setFeedback({ tone: 'success', text: `Conexão confirmada. Este token pode usar ${usable.length} de ${tools.length} ferramentas.` });
      onTested?.();
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível conectar ao MCP.' });
    } finally { setTesting(false); }
  }

  return <form onSubmit={event => void run(event)} className="space-y-4">
    <label className={labelClass}>Token MCP<input type="password" value={token} onChange={event => { setToken(event.target.value); setFeedback(null); setResult(null); }} autoComplete="off" className={`${fieldClass} font-mono`} placeholder="uim_…" /></label>
    <details className="text-sm">
      <summary className="cursor-pointer select-none text-xs font-medium text-slate-500 transition-colors hover:text-slate-900">Usar outro endereço do MCP</summary>
      <label className={`${labelClass} mt-3`}>URL do MCP<input type="url" value={endpoint} onChange={event => { setEndpoint(event.target.value); setFeedback(null); }} autoComplete="off" spellCheck={false} className={`${fieldClass} font-mono text-xs`} aria-invalid={!validEndpoint} /></label>
      {!validEndpoint ? <p className="mt-1.5 text-xs text-rose-700">A URL deve ser HTTPS e terminar em /mcp/integra (localhost aceita HTTP).</p> : null}
    </details>
    <Notice feedback={feedback} />
    {result ? <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-slate-200 px-4 py-3.5 text-xs leading-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="font-medium text-slate-500">Servidor</dt><dd className="font-mono text-slate-800">{result.server}</dd>
      <dt className="font-medium text-slate-500">Liberadas <span className="tabular-nums">({result.usable.length})</span></dt><dd className="font-mono text-slate-800 [overflow-wrap:anywhere]">{result.usable.join(', ') || '—'}</dd>
      {result.blocked.length ? <><dt className="font-medium text-slate-500">Sem permissão <span className="tabular-nums">({result.blocked.length})</span></dt><dd className="font-mono text-slate-500 [overflow-wrap:anywhere]">{result.blocked.join(', ')}</dd></> : null}
    </dl> : null}
    <button type="submit" disabled={testing || !token.trim()} className={secondaryButtonClass}>{testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}{testing ? 'Testando…' : 'Testar conexão'}</button>
  </form>;
}

export function ProtectionsList({ className = 'space-y-2.5' }: { className?: string }) {
  return <ul className={`text-xs leading-5 text-slate-600 ${className}`}>
    {['Token exibido uma única vez; o servidor guarda só o hash.', 'Cada token executa apenas as ferramentas das permissões marcadas.', 'Validade de até 365 dias, com revogação imediata.', 'Ações gravam o operador responsável no histórico.', 'Senhas e credenciais de banco não voltam nas respostas.'].map(text => <li key={text} className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-slate-400" />{text}</li>)}
  </ul>;
}
