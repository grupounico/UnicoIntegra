import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Bot, CheckCircle2, Headset, Loader2, ShoppingCart } from 'lucide-react';
import { createDeploymentAi, getDeployment, type Deployment } from '../../services/catalogDeployment.service';
import { getAuthSession } from '../../utils/authSession';
import { CatalogPageHeader, CatalogScreen, fieldClass, labelClass, primaryButtonClass } from './catalogUi';

// Modalidades da etapa. Só a IA de venda existe hoje; as demais aparecem como próximas.
const modalities = [
  { id: 'venda', title: 'IA de venda', description: 'Busca no catálogo importado, envia cartões com imagem e botão Comprar e monta o carrinho na conversa.', icon: ShoppingCart, available: true },
  { id: 'atendimento', title: 'IA de atendimento', description: 'Dúvidas gerais e triagem, sem venda.', icon: Headset, available: false },
  { id: 'webchat', title: 'IA de WebChat', description: 'Venda pelo WebChat integrado ao checkout.', icon: Bot, available: false },
] as const;

export default function CatalogAiPage() {
  const { deploymentId = '' } = useParams();
  const [query, setQuery] = useSearchParams();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [unitId, setUnitId] = useState('');
  const [name, setName] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unit = deployment?.units.find(item => item.id === unitId);
  const config = unit?.atenderBemConfig;
  const ai = config?.ai;
  const instance = (() => { try { return config?.mcpUrl ? new URL(config.mcpUrl).origin : ''; } catch { return ''; } })();
  const ready = Boolean(instance && config?.groupId && (!config.import || config.import.status === 'completed'));

  useEffect(() => {
    void getDeployment(deploymentId).then(value => {
      setDeployment(value);
      setUnitId(value.units.find(item => item.id === query.get('unit'))?.id || value.units[0]?.id || '');
    }).catch(reason => setError(reason.message));
    // A unidade escolhida é estado local; a query só define a inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId]);
  useEffect(() => {
    if (!unit) return;
    setName(unit.atenderBemConfig?.ai?.name || `IA de Venda - ${unit.name}`);
    setSignatureName(unit.atenderBemConfig?.ai?.signatureName || unit.name);
  }, [unit]);

  async function create() {
    if (busy || !unit) return;
    setBusy(true); setError('');
    try {
      await createDeploymentAi(deploymentId, unit.id, { modality: 'venda', name, signatureName }, getAuthSession()?.username || 'Integra');
      setDeployment(await getDeployment(deploymentId));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a IA.'); }
    finally { setBusy(false); }
  }

  return <CatalogScreen>
    <CatalogPageHeader title="Criação da IA" description="Assistente, URAs e automações criados na instância do cliente com os dados desta implantação" backTo={`/main/catalogo/${deploymentId}`} />
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-7 sm:px-8"><div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-xl border border-[#dbe3ef] bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">1. Modalidade</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{modalities.map(item => <div key={item.id} aria-disabled={!item.available} className={`rounded-lg border p-4 text-sm ${item.available ? 'border-primary bg-blue-50' : 'border-slate-200 opacity-60'}`}>
          <item.icon className={`size-5 ${item.available ? 'text-primary' : 'text-slate-500'}`} aria-hidden="true" />
          <p className="mt-2 font-semibold text-slate-900">{item.title}{!item.available && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Em breve</span>}</p>
          <p className="mt-1 leading-5 text-slate-600">{item.description}</p>
        </div>)}</div>
      </section>

      <section className="rounded-xl border border-[#dbe3ef] bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">2. Dados do cliente</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Vêm da implantação e da etapa AtenderBem. O acesso à instância é feito pelo Integra.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>Unidade<select disabled={busy} className={fieldClass} value={unitId} onChange={event => { setUnitId(event.target.value); setQuery({ unit: event.target.value }); setError(''); }}>{deployment?.units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className={labelClass}>Instância<p className="mt-2 min-h-11 break-all rounded-lg bg-slate-50 px-3.5 py-3 text-sm font-normal text-slate-700">{instance || 'Conclua a etapa AtenderBem'}</p></div>
          <div className={labelClass}>Grupo de produtos<p className="mt-2 min-h-11 rounded-lg bg-slate-50 px-3.5 py-3 text-sm font-normal text-slate-700">{config?.groupId ? `${config.groupName || 'Grupo'} · ID ${config.groupId}` : 'Aguardando grupo'}</p></div>
          <div className={labelClass}>Importação do catálogo<p className="mt-2 min-h-11 rounded-lg bg-slate-50 px-3.5 py-3 text-sm font-normal text-slate-700">{!config?.import ? 'Sem importação registrada' : config.import.status === 'completed' ? 'Concluída' : 'Em andamento — aguarde concluir'}</p></div>
          <label className={labelClass}>Nome do assistente<input maxLength={120} disabled={busy || Boolean(ai && ai.status !== 'failed')} className={fieldClass} value={name} onChange={event => setName(event.target.value)} /></label>
          <label className={labelClass}>Assinatura nas mensagens<input maxLength={100} disabled={busy || Boolean(ai && ai.status !== 'failed')} className={fieldClass} value={signatureName} onChange={event => setSignatureName(event.target.value)} /></label>
        </div>
      </section>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {ai?.status === 'failed' && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Última tentativa falhou: {ai.error}</div>}

      {ai?.status === 'created' ? <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
        <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5" aria-hidden="true" />IA criada na instância</p>
        <p className="mt-2">Assistente {ai.assistantId} · URA {ai.supportFlows?.uraIaId || '—'} · URA AB {ai.supportFlows?.uraAbId || '—'} · Envio de produto {ai.supportFlows?.downloadImagemId || '—'} · Pré-processamento {ai.supportFlows?.preProcessId || '—'}</p>
        <p className="mt-2 text-emerald-800">Próximo passo no AtenderBem: vincular a URA à fila do WhatsApp e o funil do carrinho ao conector "Carrinho CRM".</p>
      </section> : <button type="button" disabled={busy || !ready || ai?.status === 'creating'} className={primaryButtonClass} onClick={() => void create()}>
        {busy || ai?.status === 'creating' ? <><Loader2 className="size-4 animate-spin" />Criando assistente, URAs e automações…</> : ai?.status === 'failed' ? 'Tentar novamente' : 'Criar IA de venda'}
      </button>}
    </div></div>
  </CatalogScreen>;
}
