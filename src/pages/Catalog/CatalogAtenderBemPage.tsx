import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, Save } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getAtenderBemSettings, getDeployment, saveAtenderBemConfiguration, createAtenderBemGroup, runAtenderBemImport, type AtenderBemConfigurationInput, type Deployment, type DeploymentUnit } from '../../services/catalogDeployment.service';
import { getAuthSession } from '../../utils/authSession';
import { CatalogPageHeader, CatalogScreen, fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from './catalogUi';

const steps = ['Unidade', 'Conexão', 'Catálogo', 'Revisão'];
function formFor(unit?: DeploymentUnit): AtenderBemConfigurationInput {
  const saved = unit?.atenderBemConfig;
  return { mcpUrl: saved?.mcpUrl || 'https://ambientesdetesteunicocontato.atenderbem.com/mcp', mcpKey: '',
    feedKey: '',
    feedAuth: saved?.feedAuth || 'api-key',
    groupMode: saved?.groupMode || 'create', groupName: saved?.groupName || 'farma', groupId: saved?.groupId ? String(saved.groupId) : '' };
}
function validUrl(raw: string, mcp = false) {
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && (!mcp || url.pathname.replace(/\/$/, '') === '/mcp'); } catch { return false; }
}
function positiveId(raw: string) { return Number.isSafeInteger(Number(raw)) && Number(raw) > 0; }
function Field({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <label className={labelClass}>{title}{children}{hint && <span className="mt-2 block text-xs font-normal leading-5 text-slate-600">{hint}</span>}</label>;
}

export default function CatalogAtenderBemPage() {
  const { deploymentId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [unitId, setUnitId] = useState('');
  const [form, setForm] = useState(formFor());
  const [feedBaseUrl, setFeedBaseUrl] = useState('');
  const [feedIdSource, setFeedIdSource] = useState<'saved' | 'hubSellerUnitId' | 'sourceUnitId'>('saved');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const selected = deployment?.units.find(unit => unit.id === unitId);
  const changedMcp = selected?.atenderBemConfig?.mcpUrl !== form.mcpUrl;
  const changedFeed = selected?.atenderBemConfig?.feedBaseUrl !== feedBaseUrl || selected?.atenderBemConfig?.feedAuth !== form.feedAuth;
  const feedUnitId = feedIdSource === 'saved' ? selected?.atenderBemConfig?.feedUnitId : selected?.[feedIdSource];
  const feedUrl = feedBaseUrl && positiveId(String(feedUnitId ?? '')) ? (() => { const url = new URL(feedBaseUrl); url.searchParams.set('unidadeId', String(feedUnitId)); return url.toString(); })() : '';
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getDeployment(deploymentId), getAtenderBemSettings()]).then(([result, settings]) => {
      if (!active) return;
      const unit = result.units.find(item => item.id === search.get('unit')) || result.units[0];
      if (unit?.atenderBemConfig?.import?.jobId && ['queued', 'running'].includes(unit.atenderBemConfig.import.status)) {
        navigate(`/main/catalogo/${deploymentId}`, { replace: true });
        return;
      }
      setFeedBaseUrl(settings.feedBaseUrl); setFeedIdSource(settings.feedUnitIdSource);
      setDeployment(result); setUnitId(unit?.id || ''); setForm(formFor(unit));
      if (unit?.atenderBemConfig?.groupId) setStep(3);
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a implantação.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // Selecting another unit is handled locally to avoid reloading and clearing its form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);
  useEffect(() => { if (!loading) heading.current?.focus(); }, [step, loading]);
  function update<K extends keyof AtenderBemConfigurationInput>(key: K, value: AtenderBemConfigurationInput[K]) {
    setForm(current => ({ ...current, [key]: value })); setError('');
  }
  function validation(at: number): string {
    if (!selected) return 'Selecione uma unidade desta implantação.';
    if (at >= 1) {
      if (!validUrl(form.mcpUrl, true)) return 'Informe uma URL HTTPS de MCP terminada em /mcp, sem parâmetros ou credenciais.';
      if (!form.mcpKey.trim() && (!selected.atenderBemConfig?.hasMcpKey || changedMcp)) return 'Informe a chave MCP para essa instância.';
    }
    if (at >= 2) {
      if (!feedUrl) return 'O ID do feed ainda não está vinculado à unidade selecionada. Confirme o vínculo antes de salvar.';
      if (!form.feedKey.trim() && (!selected.atenderBemConfig?.hasFeedKey || changedFeed)) return 'Informe a credencial do feed.';
      if (form.groupMode === 'existing' && !positiveId(form.groupId)) return 'Informe o ID do grupo existente.';
      if (form.groupMode === 'create' && (!form.groupName.trim() || form.groupName.trim().length > 255)) return 'Informe um nome de grupo com até 255 caracteres.';
    }
    return '';
  }
  function next() { const message = validation(step); if (message) setError(message); else { setError(''); setStep(current => current + 1); } }
  async function save() {
    const message = validation(3); if (message) { setError(message); return; }
    setBusy(true); setError('');
    try {
      let config = await saveAtenderBemConfiguration(deploymentId, unitId, form, getAuthSession()?.username || 'Operador Unico');
      setDeployment(current => current ? { ...current, units: current.units.map(unit => unit.id === unitId ? { ...unit, atenderBemConfig: config } : unit) } : current);
      setForm(current => ({ ...current, mcpKey: '', feedKey: '' }));
      if (!config.groupId) config = await createAtenderBemGroup(deploymentId, unitId, getAuthSession()?.username || 'Operador Unico');
      setDeployment(current => current ? { ...current, units: current.units.map(unit => unit.id === unitId ? { ...unit, atenderBemConfig: config } : unit) } : current);
      setForm(current => ({ ...current, groupMode: config.groupMode, groupId: String(config.groupId || ''), mcpKey: '', feedKey: '' }));
      await runAtenderBemImport(deploymentId, unitId);
      navigate(`/main/catalogo/${deploymentId}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a configuração.'); }
    finally { setBusy(false); }
  }
  return <CatalogScreen>
    <CatalogPageHeader title="Configurar AtenderBem" description={deployment ? `${deployment.groupName} · Etapa final do catálogo` : 'Carregando implantação…'} backTo={`/main/catalogo/${deploymentId}`} />
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8"><div className="mx-auto max-w-4xl">
      {loading ? <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="size-4 animate-spin" />Carregando dados…</p> : !deployment ? <p role="alert" className="text-sm text-rose-700">{error}</p> : <>
        <p className="mb-6 max-w-2xl text-sm leading-6 text-slate-600">Conecte o catálogo desta unidade à pesquisa do AtenderBem. Esta configuração pode ser feita também nas implantações já existentes.</p>
        <nav aria-label="Etapas da configuração"><ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">{steps.map((label, index) => <li key={label}><button type="button" disabled={busy || index > step} aria-current={index === step ? 'step' : undefined} onClick={() => { setStep(index); setError(''); }} className={`flex w-full items-center gap-3 border-b-2 pb-3 text-left text-sm font-medium ${index === step ? 'border-primary text-primary' : 'border-slate-200 text-slate-600'} disabled:cursor-default`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs ${index === step ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>{index < step ? <Check className="size-4" /> : index + 1}</span>{label}</button></li>)}</ol></nav>
        <form className="mt-6 rounded-xl border border-[#dbe3ef] bg-white p-5 sm:p-7" onSubmit={event => { event.preventDefault(); if (step < 3) next(); else if (!busy) void save(); }}>
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold text-slate-950 outline-none">{['Qual unidade vamos conectar?', 'Acesso à instância do AtenderBem', 'Origem e grupo de produtos', 'Revise a configuração'][step]}</h2>
          {step === 0 && <div className="mt-6 space-y-5"><Field title="Unidade"><select className={fieldClass} value={unitId} onChange={event => { const unit = deployment.units.find(item => item.id === event.target.value); setUnitId(event.target.value); setForm(formFor(unit)); setSearch({ unit: event.target.value }, { replace: true }); setError(''); }}>{deployment.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name} · {unit.code}{unit.atenderBemConfig ? ' · Configuração salva' : ''}</option>)}</select></Field><dl className="grid grid-cols-2 gap-5 border-t border-slate-200 pt-5 text-sm"><div><dt className="text-slate-600">Implantação</dt><dd className="mt-1 font-medium">{deployment.flowMode === 'hub_banco_only' ? 'Hub e Banco Único' : 'Catálogo completo'}</dd></div><div><dt className="text-slate-600">Unidade no Hub</dt><dd className="mt-1 font-medium">{selected?.hubSellerUnitId || 'Ainda não vinculada'}</dd></div></dl><p className="text-sm leading-6 text-slate-600">Você pode preparar os dados agora. A importação depende do catálogo disponível e dos acessos validados.</p></div>}
          {step === 1 && <div className="mt-6 space-y-5"><Field title="URL do MCP" hint="Use o endpoint /mcp da instância que receberá os produtos."><input required type="url" className={fieldClass} value={form.mcpUrl} onChange={event => update('mcpUrl', event.target.value)} /></Field><Field title="Chave MCP" hint={selected?.atenderBemConfig?.hasMcpKey && !changedMcp ? 'Chave já salva. Deixe em branco para mantê-la.' : 'Credencial usada no acesso Bearer à instância.'}><input type="password" autoComplete="new-password" className={fieldClass} value={form.mcpKey} onChange={event => update('mcpKey', event.target.value)} /></Field><p className="text-xs leading-5 text-slate-600">As credenciais são cifradas no servidor e não voltam para o formulário.</p></div>}
          {step === 2 && <div className="mt-6 space-y-5">
            <Field title="Autenticação do feed">
              <select className={fieldClass} value={form.feedAuth} onChange={event => update('feedAuth', event.target.value as 'bearer' | 'api-key')}>
                <option value="api-key">X-API-Key</option>
                <option value="bearer">Bearer Token</option>
              </select>
            </Field>
            <Field title="Credencial do feed" hint={selected?.atenderBemConfig?.hasFeedKey && !changedFeed ? 'Credencial já salva. Deixe em branco para mantê-la.' : 'Credencial que permite consultar o CSV dessa unidade.'}>
              <input type="password" autoComplete="new-password" className={fieldClass} value={form.feedKey} onChange={event => update('feedKey', event.target.value)} />
            </Field>
            <div className="border-t border-slate-200 pt-5">
              <Field title="Grupo no AtenderBem">
                <select className={fieldClass} value={form.groupMode} onChange={event => update('groupMode', event.target.value as 'create' | 'existing')}>
                  <option value="create">Criar um grupo</option>
                  <option value="existing">Usar grupo existente</option>
                </select>
              </Field>
              <div className="mt-5">{form.groupMode === 'create' ? <Field title="Nome do grupo"><input required maxLength={255} className={fieldClass} value={form.groupName} onChange={event => update('groupName', event.target.value)} /></Field> : <Field title="ID do grupo existente"><input required type="number" min="1" step="1" className={fieldClass} value={form.groupId} onChange={event => update('groupId', event.target.value)} /></Field>}</div>
            </div>
          </div>}
          {step === 3 && <div className="mt-6"><dl className="divide-y divide-slate-200 text-sm">{[
            ['Unidade', selected?.name], ['Instância MCP', form.mcpUrl], ['Feed CSV', feedUrl || 'ID ainda não vinculado'],
            ['Autenticação do feed', form.feedAuth === 'bearer' ? 'Bearer Token' : 'X-API-Key'], ['Grupo', form.groupMode === 'create' ? `Criar: ${form.groupName}` : `Existente: ${form.groupId}`],
            ['Formato do catálogo', 'Meta Commerce · CSV'], ['Produtos ausentes', 'Ignorar e manter os dados atuais'], ['Arquivo atualizado', 'Substituir o arquivo anterior'], ['Frequência prevista', 'A cada 8 horas'],
          ].map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-5"><dt className="text-slate-600">{label}</dt><dd className="break-all font-medium text-slate-900">{value}</dd></div>)}</dl><p className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">Ao confirmar, salvaremos os dados, criaremos o grupo se necessário e iniciaremos a importação do CSV. Você voltará aos detalhes do catálogo para acompanhar. A atualização automática de 8 horas continua desativada.</p></div>}
          {error && <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5"><button type="button" disabled={busy || step === 0} className={secondaryButtonClass} onClick={() => { setStep(current => current - 1); setError(''); }}><ArrowLeft className="size-4" />Anterior</button><button type="submit" disabled={busy || !selected} className={primaryButtonClass}>{busy ? <Loader2 className="size-4 animate-spin" /> : step === 3 ? <Save className="size-4" /> : null}{busy ? 'Iniciando importação…' : step === 3 ? 'Confirmar e importar' : 'Continuar'}{step < 3 && <ArrowRight className="size-4" />}</button></footer>
        </form>
      </>}
    </div></div>
  </CatalogScreen>;
}
