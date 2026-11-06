import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, Plus, RefreshCw } from 'lucide-react';
import { CatalogPageHeader, CatalogScreen, ToneDot, formatDate, primaryButtonClass } from './catalogUi';
import { ClientConfig, ConnectionTest, Notice, ProtectionsList, SCOPE_LABEL, SectionHeading, TOKEN_PLACEHOLDER, credentialStatus, defaultMcpEndpoint, integraApi } from './catalogMcpShared';
import type { McpCredential } from './catalogMcpShared';

const NEW_TOKEN_PATH = '/main/catalogo/mcp/novo';

export default function CatalogMcpPage() {
  const [credentials, setCredentials] = useState<McpCredential[]>([]);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const activeCount = credentials.filter(item => credentialStatus(item).active).length;

  const loadCredentials = useCallback(async () => {
    setListState(current => current === 'ready' ? 'ready' : 'loading');
    try {
      setCredentials(await integraApi<McpCredential[]>('/api/mcp/credentials'));
      setListError(''); setListState('ready');
    } catch (error) { setListError(error instanceof Error ? error.message : 'Não foi possível carregar os tokens.'); setListState('error'); }
  }, []);
  useEffect(() => { void loadCredentials(); }, [loadCredentials]);

  async function revokeCredential(item: McpCredential) {
    if (!window.confirm(`Revogar o token "${item.name}"? Clientes que usam este token perdem o acesso na hora.`)) return;
    setRevoking(item.id);
    try { await integraApi(`/api/mcp/credentials/${item.id}`, { method: 'DELETE' }); await loadCredentials(); }
    catch (error) { setListError(error instanceof Error ? error.message : 'Não foi possível revogar o token.'); }
    finally { setRevoking(null); }
  }

  const scopeText = (item: McpCredential) => item.scopes.map(scope => SCOPE_LABEL[scope] ?? scope).join(', ');
  const validityLabel = (item: McpCredential) => item.revokedAt ? 'Revogado em' : credentialStatus(item).active ? 'Expira em' : 'Expirou em';
  const revokeButton = (item: McpCredential) => <button type="button" disabled={revoking === item.id} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50" onClick={() => void revokeCredential(item)}>{revoking === item.id ? <Loader2 className="size-3.5 animate-spin" /> : null}Revogar</button>;

  return <CatalogScreen>
    <CatalogPageHeader
      title="Tokens MCP"
      description="Acesso de IAs ao fluxo de catálogo pelo MCP do Integra. Não é o MCP do AtenderBem."
      backTo="/main/catalogo"
      action={<Link to={NEW_TOKEN_PATH} className={`${primaryButtonClass} shrink-0`}><Plus className="size-4" /><span className="max-sm:hidden">Novo token</span><span className="sm:hidden">Novo</span></Link>}
    />
    <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto bg-white [scrollbar-gutter:stable] selection:bg-primary/15">
      <div className="mx-auto w-full max-w-6xl px-5 pb-14 pt-8 sm:px-8">
        <section aria-labelledby="tokens-title">
          <SectionHeading
            id="tokens-title"
            title={listState === 'ready' ? `Seus tokens · ${activeCount} ativo${activeCount === 1 ? '' : 's'}` : 'Seus tokens'}
            description="Tokens criados com o seu usuário do AtenderBem. Cada um vale até expirar ou ser revogado, mesmo depois de sair e entrar de novo no Integra."
            action={<button type="button" onClick={() => void loadCredentials()} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label="Atualizar lista de tokens"><RefreshCw className={`size-3.5 ${listState === 'loading' ? 'animate-spin' : ''}`} /><span className="max-sm:sr-only">Atualizar</span></button>}
          />
          {listError ? <div className="mt-4"><Notice feedback={{ tone: 'error', text: listError }} /></div> : null}
          {listState === 'loading' && !credentials.length ? <p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Carregando tokens…</p> : null}
          {listState === 'ready' && !credentials.length ? <div className="mt-5 flex flex-col items-center rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full border border-slate-200 text-slate-500"><KeyRound className="size-4" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-900">Você ainda não tem tokens</p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Crie um token com as permissões que a IA precisa para começar a usar o MCP.</p>
            <Link to={NEW_TOKEN_PATH} className={`${primaryButtonClass} mt-5`}><Plus className="size-4" />Criar token</Link>
          </div> : null}
          {credentials.length ? <div className="mt-5 rounded-lg border border-slate-200">
            {/* Wide screens: full table. Narrow panes: stacked rows, so nothing is cut off. */}
            <table className="hidden w-full text-left text-sm lg:table">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
                <tr><th scope="col" className="px-4 py-2.5 font-medium">Nome</th><th scope="col" className="px-4 py-2.5 font-medium">Permissões</th><th scope="col" className="px-4 py-2.5 font-medium">Status</th><th scope="col" className="px-4 py-2.5 font-medium">Validade</th><th scope="col" className="px-4 py-2.5 font-medium">Último uso</th><th scope="col" className="px-4 py-2.5"><span className="sr-only">Ações</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {credentials.map(item => {
                  const status = credentialStatus(item);
                  return <tr key={item.id} className="transition-colors hover:bg-slate-50/60">
                    <td className="max-w-[14rem] px-4 py-3"><span className={`block truncate font-medium ${status.active ? 'text-slate-900' : 'text-slate-500'}`} title={item.name}>{item.name}</span><span className="block text-xs tabular-nums text-slate-400">Criado em {formatDate(item.createdAt)}</span></td>
                    <td className="max-w-[16rem] px-4 py-3 text-[13px] leading-5 text-slate-600">{scopeText(item)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><ToneDot tone={status.tone} label={status.label} className="text-[13px]" /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] tabular-nums text-slate-600"><span className="block text-xs text-slate-400">{validityLabel(item)}</span>{formatDate(item.revokedAt ?? item.expiresAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] tabular-nums text-slate-600">{item.lastUsedAt ? formatDate(item.lastUsedAt) : <span className="text-slate-400">Nunca usado</span>}</td>
                    <td className="px-4 py-2.5 text-right">{status.active ? revokeButton(item) : null}</td>
                  </tr>;
                })}
              </tbody>
            </table>
            <ul className="divide-y divide-slate-200 lg:hidden">
              {credentials.map(item => {
                const status = credentialStatus(item);
                return <li key={item.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium ${status.active ? 'text-slate-900' : 'text-slate-500'}`} title={item.name}>{item.name}</p>
                      <p className="mt-0.5 text-[13px] leading-5 text-slate-600">{scopeText(item)}</p>
                    </div>
                    <ToneDot tone={status.tone} label={status.label} className="mt-0.5 shrink-0 text-[13px]" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <p className="text-xs tabular-nums text-slate-500">{validityLabel(item)} {formatDate(item.revokedAt ?? item.expiresAt)} · {item.lastUsedAt ? `Último uso ${formatDate(item.lastUsedAt)}` : 'Nunca usado'}</p>
                    {status.active ? <div className="-mr-2.5 ml-auto">{revokeButton(item)}</div> : null}
                  </div>
                </li>;
              })}
            </ul>
          </div> : null}
        </section>

        <div className="mt-12 grid gap-x-12 gap-y-10 border-t border-slate-200 pt-10 lg:grid-cols-2">
          <section aria-labelledby="connect-title" className="min-w-0">
            <SectionHeading id="connect-title" title="Conectar um cliente" description={<>Configuração pronta para o seu cliente de IA. Troque <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700">{TOKEN_PLACEHOLDER}</code> pelo token.</>} />
            <div className="mt-5"><ClientConfig endpoint={defaultMcpEndpoint()} token={TOKEN_PLACEHOLDER} /></div>
          </section>
          <section aria-labelledby="test-title" className="min-w-0">
            <SectionHeading id="test-title" title="Testar um token" description="Confirma se o token é aceito e quais ferramentas ele libera. Nada é salvo." />
            <div className="mt-5"><ConnectionTest onTested={() => void loadCredentials()} /></div>
          </section>
        </div>

        <section aria-labelledby="protections-title" className="mt-12 border-t border-slate-200 pt-8">
          <h2 id="protections-title" className="text-xs font-semibold text-slate-900">Proteções</h2>
          <ProtectionsList className="mt-3 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3" />
        </section>
      </div>
    </main>
  </CatalogScreen>;
}
