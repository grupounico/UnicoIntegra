import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clipboard, KeyRound, Loader2, TriangleAlert } from 'lucide-react';
import { CatalogPageHeader, CatalogScreen, fieldClass, formatDate, labelClass, primaryButtonClass, secondaryButtonClass } from './catalogUi';
import { ClientConfig, ConnectionTest, MCP_SCOPES, Notice, ProtectionsList, SCOPE_LABEL, SectionHeading, defaultMcpEndpoint, integraApi, useCopy } from './catalogMcpShared';
import type { Feedback, McpCredential, McpScope } from './catalogMcpShared';

const LIST_PATH = '/main/catalogo/mcp';
const VALIDITY = [[1, '1 hora'], [24, '24 horas'], [168, '7 dias'], [720, '30 dias'], [8760, '365 dias']] as const;
type Created = McpCredential & { secret: string };

export default function CatalogMcpNewPage() {
  const [name, setName] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(168);
  const [scopes, setScopes] = useState<McpScope[]>(['catalog:read']);
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [created, setCreated] = useState<Created | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !scopes.length) return;
    setCreating(true); setFeedback(null);
    try {
      setCreated(await integraApi<Created>('/api/mcp/credentials', { method: 'POST', body: JSON.stringify({ name: name.trim(), expiresInHours, scopes }) }));
    } catch (error) { setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível criar o token.' }); }
    finally { setCreating(false); }
  }

  function reset() {
    setCreated(null); setName(''); setScopes(['catalog:read']); setExpiresInHours(168); setFeedback(null);
  }

  return <CatalogScreen>
    <CatalogPageHeader title={created ? 'Token criado' : 'Novo token MCP'} description={created ? 'Copie o token e configure o cliente de IA.' : 'Defina quem usa o token, por quanto tempo e o que ele pode fazer.'} backTo={LIST_PATH} />
    <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto bg-white [scrollbar-gutter:stable] selection:bg-primary/15">
      {created ? <CreatedView created={created} onCreateAnother={reset} /> : <form onSubmit={event => void submit(event)} className="flex min-h-full flex-col">
        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-x-12 gap-y-10 px-5 pb-10 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="min-w-0 space-y-10">
            <section aria-labelledby="identity-title">
              <SectionHeading id="identity-title" title="Identificação" description="Use um nome que diga quem ou o que vai usar o token. Ele aparece na listagem e no histórico." />
              <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <label className={labelClass}>Nome<input autoFocus className={fieldClass} value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="Ex.: Claude Code do João" required /></label>
                <label className={labelClass}>Validade<select className={fieldClass} value={expiresInHours} onChange={event => setExpiresInHours(Number(event.target.value))}>{VALIDITY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
            </section>

            <section aria-labelledby="scopes-title" className="border-t border-slate-200 pt-10">
              <SectionHeading id="scopes-title" title="Permissões" description="Libere só o necessário. Ferramentas fora das permissões aparecem para a IA como indisponíveis." />
              <fieldset className="mt-5">
                <legend className="sr-only">Permissões do token</legend>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {MCP_SCOPES.map(scope => {
                    const checked = scopes.includes(scope.value);
                    return <label key={scope.value} className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/80">
                      <input type="checkbox" className="mt-[5px] size-4 shrink-0 accent-primary" checked={checked} onChange={event => setScopes(current => event.target.checked ? MCP_SCOPES.map(item => item.value).filter(value => value === scope.value || current.includes(value)) : current.filter(item => item !== scope.value))} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-6 text-slate-900">{scope.label}</span>
                        <span className="block text-[13px] leading-5 text-slate-500">{scope.description}</span>
                        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">{scope.tools.map(tool => <code key={tool} className={`font-mono text-[11px] leading-[18px] ${checked ? 'text-slate-600' : 'text-slate-400'}`}>{tool}</code>)}</span>
                      </span>
                    </label>;
                  })}
                </div>
                {!scopes.length ? <p className="mt-2 text-xs font-medium text-rose-700">Marque ao menos uma permissão.</p> : null}
              </fieldset>
            </section>
            <Notice feedback={feedback} />
          </div>

          <aside className="text-sm max-lg:border-t max-lg:border-slate-200 max-lg:pt-8 lg:sticky lg:top-8 lg:self-start">
            <h2 className="text-xs font-semibold text-slate-900">Resumo</h2>
            <dl className="mt-3 space-y-2.5 text-xs leading-5">
              <div><dt className="text-slate-500">Nome</dt><dd className="truncate font-medium text-slate-900">{name.trim() || '—'}</dd></div>
              <div><dt className="text-slate-500">Validade</dt><dd className="font-medium tabular-nums text-slate-900">{VALIDITY.find(([value]) => value === expiresInHours)?.[1]} · até {formatDate(new Date(Date.now() + expiresInHours * 3600000).toISOString())}</dd></div>
              <div><dt className="text-slate-500">Permissões</dt><dd className="font-medium text-slate-900">{scopes.length ? scopes.map(scope => SCOPE_LABEL[scope]).join(', ') : '—'}</dd></div>
            </dl>
            <h2 className="mt-8 text-xs font-semibold text-slate-900">Proteções</h2>
            <ProtectionsList className="mt-3 space-y-2.5" />
          </aside>
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-2 px-5 py-3 sm:px-8">
            <Link to={LIST_PATH} className={secondaryButtonClass}>Cancelar</Link>
            <button type="submit" className={primaryButtonClass} disabled={!name.trim() || !scopes.length || creating}>{creating ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}{creating ? 'Criando…' : 'Criar token'}</button>
          </div>
        </div>
      </form>}
    </main>
  </CatalogScreen>;
}

function CreatedView({ created, onCreateAnother }: { created: Created; onCreateAnother: () => void }) {
  const { copied, copy } = useCopy();
  return <div className="flex min-h-full flex-col">
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-5 pb-10 pt-8 sm:px-8">
      <section aria-labelledby="secret-title">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 text-emerald-600"><Check className="size-4" /></span>
          <div className="min-w-0">
            <h2 id="secret-title" className="text-[15px] font-semibold leading-7 text-slate-950">“{created.name}” está pronto</h2>
            <p className="text-sm leading-6 text-slate-600">{created.scopes.map(scope => SCOPE_LABEL[scope] ?? scope).join(', ')} · expira em <span className="tabular-nums">{formatDate(created.expiresAt)}</span></p>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <input readOnly value={created.secret} onFocus={event => event.currentTarget.select()} className={`${fieldClass} mt-0 min-w-0 font-mono text-xs`} aria-label="Token criado" />
          <button type="button" className={secondaryButtonClass} onClick={() => void copy(created.secret, 'secret')}>{copied === 'secret' ? <Check className="size-4 text-emerald-600" /> : <Clipboard className="size-4" />}{copied === 'secret' ? 'Copiado' : 'Copiar'}</button>
        </div>
        <p className="mt-3 flex gap-2 text-xs leading-5 text-amber-800"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />Este token não será exibido de novo. Guarde em local seguro antes de sair desta página.</p>
      </section>

      <section aria-labelledby="client-title" className="border-t border-slate-200 pt-10">
        <SectionHeading id="client-title" title="Configurar o cliente de IA" description="A configuração já inclui o token. Não compartilhe." />
        <div className="mt-5"><ClientConfig endpoint={defaultMcpEndpoint()} token={created.secret} /></div>
      </section>

      <section aria-labelledby="test-title" className="border-t border-slate-200 pt-10">
        <SectionHeading id="test-title" title="Testar conexão" description="Confirma que o token é aceito e mostra as ferramentas liberadas." />
        <div className="mt-5"><ConnectionTest initialToken={created.secret} /></div>
      </section>
    </div>

    <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-end gap-2 px-5 py-3 sm:px-8">
        <button type="button" onClick={onCreateAnother} className={secondaryButtonClass}>Criar outro</button>
        <Link to={LIST_PATH} className={primaryButtonClass}>Concluir</Link>
      </div>
    </div>
  </div>;
}
