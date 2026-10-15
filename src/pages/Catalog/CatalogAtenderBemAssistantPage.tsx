import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { API_BASE } from '../../services/api';
import { getAtenderBemAdminKey } from '../../services/atenderBemSession';
import { getDeployment, type Deployment } from '../../services/catalogDeployment.service';
import { CatalogPageHeader, CatalogScreen, fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from './catalogUi';

type Configuration = { profile: 'whatsapp'; storeName: string; queueId: number; modelId: number; policies: string };
type Installation = { status: string; config: Configuration; ids: Record<string, number>; steps: string[]; currentStep?: string;
  lastError?: { code: string; message: string; stage?: string } | null; queueBefore?: { ivrid?: number } };
type Discovery = { state: Installation | null; queues: { id: number; name: string; type: number; enabled: number; ivrid: number }[];
  models: Record<string, string>; warnings: string[]; storeName: string };
const labels: Record<string, string> = { form: 'Formulário de endereço', pipeline: 'Funil CRM', startStage: 'Etapa inicial', cartStage: 'Etapa do carrinho', orderStage: 'Etapa do pedido', pipelineConfigured: 'Vínculos do funil', lookup: 'Busca e link do catálogo', assistant: 'Assistente', assistantConfigured: 'Prompt e função de busca', ura: 'URA e transferência humana' };
const initial: Configuration = { profile: 'whatsapp', storeName: '', queueId: 0, modelId: -1, policies: '' };

export default function CatalogAtenderBemAssistantPage() {
  const { deploymentId = '' } = useParams();
  const [query, setQuery] = useSearchParams();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [unitId, setUnitId] = useState('');
  const [key, setKey] = useState(getAtenderBemAdminKey);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const selected = deployment?.units.find(unit => unit.id === unitId);
  useEffect(() => {
    mounted.current = true;
    void getDeployment(deploymentId).then(value => {
      if (!mounted.current) return;
      setDeployment(value);
      setUnitId(value.units.find(unit => unit.id === query.get('unit'))?.id || value.units[0]?.id || '');
    }).catch(reason => { if (mounted.current) setError(reason.message); });
    return () => { mounted.current = false; running.current = false; };
    // Selection is handled locally; changing the query must not reset an installation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);
  async function request<T>(suffix = '', body?: object): Promise<T> {
    const response = await fetch(`${API_BASE}/api/v1/deployments/${deploymentId}/units/${unitId}/atenderbem/assistant${suffix}`, {
      method: body ? 'POST' : 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(110000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error || `Falha HTTP ${response.status}.`);
    return result;
  }
  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Operação indisponível.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function connect() {
    const result = await request<Discovery>();
    if (!mounted.current) return;
    setDiscovery(result); setInstallation(result.state);
    setForm(result.state?.config || { ...initial, storeName: result.storeName });
  }
  async function install() {
    running.current = true;
    // Explicit, finite progression only while this page is open. No polling or periodic jobs.
    for (let step = 0; step < Object.keys(labels).length + 1 && running.current && mounted.current; step++) {
      const result = await request<Installation>('/next', {});
      if (!mounted.current) break;
      setInstallation(result);
      if (['ready', 'active'].includes(result.status)) break;
      if (['failed', 'uncertain'].includes(result.status)) { setError(result.lastError?.message || 'A etapa precisa de revisão.'); break; }
    }
    running.current = false;
  }
  const update = <K extends keyof Configuration>(name: K, value: Configuration[K]) => setForm(current => ({ ...current, [name]: value }));
  return <CatalogScreen>
    <CatalogPageHeader title="Assistente do catálogo no WhatsApp" description="Modelo unicodev · conversa no WhatsApp, compra no catálogo externo" backTo={`/main/catalogo/${deploymentId}`} />
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8"><div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl border border-[#dbe3ef] bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">1. Unidade e conexão</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Reutilizamos a instância e a chave MCP já salvas para o catálogo. A origem unicodev é somente o modelo: seus IDs e credenciais não são copiados.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>Unidade<select disabled={busy} className={fieldClass} value={unitId} onChange={event => { setUnitId(event.target.value); setQuery({ unit: event.target.value }); setDiscovery(null); setInstallation(null); setHumanConfirmed(false); setReplaceExisting(false); }}>{deployment?.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
          <label className={labelClass}>Chave administrativa do Integra<input type="password" autoComplete="off" disabled={busy} className={fieldClass} value={key} onChange={event => setKey(event.target.value)} /><span className="mt-1 block text-xs font-normal text-slate-500">ADMIN_API_KEY do backend. Usada apenas nesta tela, sem armazenamento no navegador.</span></label>
        </div>
        <dl className="mt-5 space-y-2 break-all text-sm text-slate-600"><div>Destino: {selected?.atenderBemConfig?.mcpUrl || 'Configure o AtenderBem primeiro'}</div><div>Catálogo: {selected?.storefrontDomain || 'Aguardando domínio'}</div><div>Tenant: {selected?.unicommerceTenantId || 'Aguardando tenant'}</div></dl>
        <button disabled={busy || !key.trim() || !selected?.atenderBemConfig?.groupId} className={`${secondaryButtonClass} mt-5`} onClick={() => void act(connect)}><RefreshCw className="size-4" />Consultar configuração</button>
      </div>
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {busy && <p role="status" className="flex items-center gap-2 text-sm text-blue-700"><Loader2 className="size-4 animate-spin" />Processando uma etapa por vez…</p>}
      {discovery && !installation && <form className="rounded-xl border border-[#dbe3ef] bg-white p-6" onSubmit={event => { event.preventDefault(); void act(async () => setInstallation(await request<Installation>('/prepare', form))); }}>
        <h2 className="text-lg font-semibold text-slate-950">2. Personalize o atendimento</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>Nome da loja<input required maxLength={100} disabled={busy} className={fieldClass} value={form.storeName} onChange={event => update('storeName', event.target.value)} /></label>
          <label className={labelClass}>Fila WhatsApp<select required disabled={busy} className={fieldClass} value={form.queueId || ''} onChange={event => update('queueId', Number(event.target.value))}><option value="">Selecione</option>{discovery.queues.filter(queue => [10, 21, 23, 25].includes(queue.type)).map(queue => <option key={queue.id} value={queue.id}>{queue.name}{queue.ivrid ? ' · já possui URA' : ''}</option>)}</select></label>
          <label className={labelClass}>Modelo de IA<select required disabled={busy} className={fieldClass} value={form.modelId < 0 ? '' : form.modelId} onChange={event => update('modelId', Number(event.target.value))}><option value="">Selecione</option>{Object.entries(discovery.models).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        </div>
        <label className={`${labelClass} mt-5 block`}>Políticas confirmadas da loja<textarea required disabled={busy} maxLength={8000} rows={6} className={fieldClass} placeholder="Horários, entrega, retirada, pagamento e quando encaminhar à equipe. Não inclua credenciais." value={form.policies} onChange={event => update('policies', event.target.value)} /></label>
        <p className="mt-4 text-sm leading-6 text-slate-600">A URA e a busca seguem a sequência do unicodev. O telefone vem do atendimento WhatsApp; o teste virtual sem telefone não reproduz esse contexto. São parametrizados loja, políticas, IDs e destino do catálogo.</p>
        <button disabled={busy} type="submit" className={`${primaryButtonClass} mt-5`}>Preparar instalação</button>
      </form>}
      {installation && <div className="rounded-xl border border-[#dbe3ef] bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">3. Instalação com retomada</h2>
        <p className="mt-2 text-sm text-slate-600">{installation.config.storeName} · fila {installation.config.queueId} · {installation.steps.length}/{Object.keys(labels).length} etapas · {installation.status}</p>
        <ol className="my-5 grid gap-3 sm:grid-cols-2">{Object.entries(labels).map(([id, label]) => <li key={id} className="flex items-center gap-2 text-sm">{installation.steps.includes(id) ? <CheckCircle2 className="size-4 text-emerald-600" /> : <span className={`size-3 rounded-full ${installation.currentStep === id ? 'bg-blue-600' : 'bg-slate-200'}`} />}{label}{installation.ids[id] ? ` · ID ${installation.ids[id]}` : ''}</li>)}</ol>
        {installation.lastError && <p role="alert" className="mb-4 text-sm text-rose-700">{installation.lastError.stage}: {installation.lastError.message}</p>}
        {!['ready', 'active', 'activation_unknown', 'activating'].includes(installation.status) && <button disabled={busy || installation.lastError?.code === 'MCP_QUOTA_EXCEEDED'} className={primaryButtonClass} onClick={() => void act(install)}>{installation.steps.length || installation.lastError ? 'Retomar da etapa pendente' : 'Instalar recursos'}</button>}
        {busy && <button className={`${secondaryButtonClass} ml-3`} onClick={() => { running.current = false; }}>Pausar após esta etapa</button>}
        {['ready', 'activation_unknown', 'activating'].includes(installation.status) && <div className="border-t border-slate-200 pt-5">
          <h3 className="font-semibold">4. Revisar e vincular à fila</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">A troca afeta os próximos atendimentos da fila selecionada. Confira o assistente e a URA no AtenderBem. Os webhooks do tenant não são alterados por esta ação; valide o retorno do pedido antes de atender clientes.</p>
          <label className="mt-4 flex gap-3 text-sm"><input disabled={busy} type="checkbox" checked={humanConfirmed} onChange={event => setHumanConfirmed(event.target.checked)} />Revisei o fluxo e confirmei uma equipe humana disponível nessa fila.</label>
          {!!installation.queueBefore?.ivrid && <label className="mt-3 flex gap-3 text-sm"><input disabled={busy} type="checkbox" checked={replaceExisting} onChange={event => setReplaceExisting(event.target.checked)} />Autorizo substituir a URA atual ({installation.queueBefore.ivrid}) dessa fila.</label>}
          <button disabled={busy || !humanConfirmed || (!!installation.queueBefore?.ivrid && !replaceExisting)} className={`${primaryButtonClass} mt-5`} onClick={() => void act(async () => setInstallation(await request<Installation>('/activate', { confirm: true, confirmHumanTeam: humanConfirmed, replaceExisting })))}>Vincular / conferir fila</button>
        </div>}
        {installation.status === 'active' && <p role="status" className="text-sm text-emerald-700">Assistente e URA vinculados à fila. Homologue abertura do catálogo, carrinho, retorno do pedido e transferência humana antes do uso real.</p>}
      </div>}
      {discovery && <aside className="rounded-xl bg-slate-100 p-5 text-sm leading-6 text-slate-600"><h2 className="font-semibold text-slate-900">Limites desta instalação</h2><ul className="mt-2 list-disc space-y-1 pl-5">{discovery.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></aside>}
    </div></div>
  </CatalogScreen>;
}
