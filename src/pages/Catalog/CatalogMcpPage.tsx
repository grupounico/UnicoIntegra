import { useMemo, useState } from 'react';
import { Check, Clipboard, KeyRound, Loader2, PlugZap, ShieldCheck, TriangleAlert } from 'lucide-react';
import { API_BASE } from '../../services/api';
import { CatalogPageHeader, CatalogScreen, fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from './catalogUi';

const tools = [
  ['Preparar', 'catalog_workflow_guide, catalog_list_deployments, catalog_get_deployment'],
  ['Banco e catálogo', 'catalog_test_database_connection, catalog_create_deployment, catalog_start_deployment, catalog_refresh_runs, catalog_retry_deployment'],
  ['IA', 'catalog_create_ai'],
];

function defaultEndpoint() {
  return `${API_BASE.replace(/\/+$/, '')}/mcp/integra`;
}

function isAllowedEndpoint(value: string) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash
      && url.pathname.replace(/\/$/, '') === '/mcp/integra'
      && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
  } catch { return false; }
}

export default function CatalogMcpPage() {
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState<'url' | 'command' | null>(null);
  const validEndpoint = isAllowedEndpoint(endpoint);
  const command = useMemo(() => `claude mcp add --transport http unico-integra ${endpoint.trim() || '<URL_DO_MCP>'} --header "Authorization: Bearer <SUA_CHAVE_MCP>"`, [endpoint]);

  async function copy(value: string, target: 'url' | 'command') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied(null), 2000);
    } catch { setFeedback({ tone: 'error', text: 'Não foi possível copiar. Selecione e copie o valor manualmente.' }); }
  }

  async function testConnection() {
    if (!validEndpoint) { setFeedback({ tone: 'error', text: 'Informe a URL HTTPS do endpoint /mcp/catalogo. Em desenvolvimento, localhost também é aceito.' }); return; }
    if (!apiKey.trim()) { setFeedback({ tone: 'error', text: 'Informe a chave do MCP para testar a conexão.' }); return; }
    setTesting(true); setFeedback(null);
    try {
      const response = await fetch(endpoint.trim(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'unico-integra-connection-check', method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'unico-integra', version: '1.0.0' } } }),
      });
      const body = await response.json().catch(() => null) as { result?: { serverInfo?: { name?: string } }; error?: { message?: string }; code?: string; message?: string } | null;
      if (!response.ok || body?.error) throw new Error(body?.error?.message || body?.message || `O endpoint respondeu com HTTP ${response.status}.`);
      const name = body?.result?.serverInfo?.name || 'MCP do Unico Integra';
      setFeedback({ tone: 'success', text: `Conexão confirmada com ${name}. A chave foi usada somente neste teste e não foi salva.` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível conectar ao MCP.' });
    } finally { setTesting(false); }
  }

  return <CatalogScreen>
    <CatalogPageHeader title="Conectar MCP do Integra" description="Permita que uma IA execute o fluxo de catálogo com segurança." backTo="/main/catalogo" />
    <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto bg-white [scrollbar-gutter:stable]">
      <div className="mx-auto w-full max-w-4xl px-5 pb-12 pt-7 sm:px-8">
        <section className="border-b border-slate-200 pb-7">
          <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary"><PlugZap className="size-5" /></span><div><h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">MCP do Unico Integra</h2><p className="mt-1 max-w-[66ch] text-sm leading-6 text-slate-600">Use este servidor para testar banco, criar e acompanhar catálogos e criar IAs. Não é o MCP do AtenderBem.</p></div></div>
        </section>

        <section className="grid gap-8 border-b border-slate-200 py-7 lg:grid-cols-[minmax(0,1fr)_17rem]" aria-labelledby="connection-title">
          <div>
            <h2 id="connection-title" className="text-base font-semibold text-slate-950">Dados de conexão</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">A chave fica somente na memória desta página durante o teste. Ela não é salva nem incluída no comando copiado.</p>
            <div className="mt-6 space-y-5">
              <label className={labelClass}>URL do MCP<input type="url" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setFeedback(null); }} autoComplete="off" spellCheck={false} className={fieldClass} aria-invalid={Boolean(endpoint) && !validEndpoint} /></label>
              <label className={labelClass}>Chave do MCP<input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setFeedback(null); }} autoComplete="new-password" className={fieldClass} placeholder="Chave configurada no backend" /></label>
              {feedback ? <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border px-4 py-3 text-sm leading-6 ${feedback.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{feedback.tone === 'success' ? <Check className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}{feedback.text}</p> : null}
              <button type="button" onClick={() => void testConnection()} disabled={testing} className={primaryButtonClass}>{testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}{testing ? 'Testando conexão…' : 'Testar conexão'}</button>
            </div>
          </div>
          <aside className="border-l border-slate-200 pl-5 text-sm leading-6 text-slate-600 max-lg:border-l-0 max-lg:border-t max-lg:pt-6 max-lg:pl-0"><div className="flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck className="size-4 text-emerald-700" />Proteções</div><ul className="mt-3 space-y-2"><li>Endpoint exclusivo em <code className="text-xs">/mcp/integra</code></li><li>Chave dedicada com no mínimo 32 caracteres</li><li>Operações gravam o operador responsável</li><li>Senhas e credenciais não retornam nas tools</li></ul></aside>
        </section>

        <section className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_17rem]" aria-labelledby="client-title">
          <div><h2 id="client-title" className="text-base font-semibold text-slate-950">Adicionar ao cliente MCP</h2><p className="mt-1 text-sm leading-6 text-slate-600">Copie a URL ou use o comando abaixo no Claude Code. Substitua o placeholder pela sua chave localmente.</p><div className="mt-5 flex gap-2"><input readOnly value={endpoint} className={`${fieldClass} mt-0 min-w-0 font-mono text-xs`} aria-label="URL do MCP" /><button type="button" onClick={() => void copy(endpoint, 'url')} className={secondaryButtonClass}>{copied === 'url' ? <Check className="size-4 text-emerald-700" /> : <Clipboard className="size-4" />}{copied === 'url' ? 'Copiada' : 'Copiar'}</button></div><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-800">{command}</code><button type="button" onClick={() => void copy(command, 'command')} className={secondaryButtonClass} aria-label="Copiar comando de conexão">{copied === 'command' ? <Check className="size-4 text-emerald-700" /> : <Clipboard className="size-4" />}</button></div></div>
          <aside className="border-l border-slate-200 pl-5 max-lg:border-l-0 max-lg:border-t max-lg:pt-6 max-lg:pl-0"><h2 className="text-sm font-semibold text-slate-950">Tools disponíveis</h2><dl className="mt-3 space-y-3">{tools.map(([label, names]) => <div key={label}><dt className="text-xs font-semibold text-slate-700">{label}</dt><dd className="mt-0.5 text-xs leading-5 text-slate-600">{names}</dd></div>)}</dl><p className="mt-4 flex gap-2 text-xs leading-5 text-slate-600"><KeyRound className="mt-0.5 size-3.5 shrink-0" />A chave deve ser configurada no backend como <code>CATALOG_MCP_API_KEY</code>.</p></aside>
        </section>
      </div>
    </main>
  </CatalogScreen>;
}
