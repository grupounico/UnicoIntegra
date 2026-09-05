import { useEffect, useState } from 'react';
import { Check, CheckCircle2, FileCheck2, Image, Loader2, PackageCheck, ShieldCheck, Store } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activateTenants, getDeployment, type Deployment } from '../../services/catalogDeployment.service';
import { getAuthSession } from '../../utils/authSession';
import { CatalogPageHeader, CatalogScreen, EmptyState, StatusBadge, formatCnpj, formatDate, primaryButtonClass, secondaryButtonClass } from './catalogUi';

export default function CatalogActivationReviewPage() {
  const { deploymentId = '' } = useParams();
  const navigate = useNavigate();
  const session = getAuthSession();
  const requestedBy = session?.username || session?.authUsername || 'Operador Unico';
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try { setDeployment(await getDeployment(deploymentId)); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a revisão.'); }
      finally { setLoading(false); }
    }
    void load();
  }, [deploymentId]);

  async function handleActivation() {
    if (!deployment || deployment.status !== 'awaiting_activation' || !confirmed) return;
    setActivating(true);
    setError('');
    try {
      await activateTenants(deployment.id, requestedBy);
      navigate(`/main/catalogo/${deployment.id}`, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'A ativação não pôde ser concluída.');
      setActivating(false);
    }
  }

  if (loading) return <CatalogScreen><CatalogPageHeader title="Revisão de ativação" description="Carregando critérios…" backTo={`/main/catalogo/${deploymentId}`} /><div className="flex flex-1 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div></CatalogScreen>;
  if (!deployment || error && !deployment) return <CatalogScreen><CatalogPageHeader title="Revisão indisponível" description="Não foi possível abrir esta etapa." backTo={`/main/catalogo/${deploymentId}`} /><main className="p-8"><EmptyState title="Não foi possível carregar" description={error || 'Implantação não encontrada.'} /></main></CatalogScreen>;

  const ready = deployment.status === 'awaiting_activation';
  const allUnitsReady = deployment.units.every((unit) => ['awaiting_activation', 'active'].includes(unit.status));
  const allAssetsReady = deployment.assets.every((asset) => asset.status === 'confirmed');

  return <CatalogScreen>
    <CatalogPageHeader title="Revisão de ativação" description="Faça a conferência final antes de publicar os tenants." backTo={`/main/catalogo/${deployment.id}`} />
    <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto"><div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_350px] lg:px-10 lg:py-8">
      <div className="space-y-6">
        <section className="rounded-xl border border-[#dbe3ef] bg-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Conferência final</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-slate-950">{deployment.groupName}</h1><p className="mt-1 text-sm text-slate-500">{formatCnpj(deployment.groupCnpj)} · @{deployment.username}</p></div><StatusBadge status={deployment.status} /></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className={`rounded-lg border p-4 ${allUnitsReady ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><PackageCheck className={`size-5 ${allUnitsReady ? 'text-emerald-700' : 'text-slate-400'}`} /><p className="mt-3 text-sm font-semibold text-slate-900">Produtos importados</p><p className="mt-1 text-xs text-slate-500">{deployment.units.reduce((sum, unit) => sum + (unit.latestValidRows || 0), 0).toLocaleString('pt-BR')} itens válidos</p></div><div className={`rounded-lg border p-4 ${allAssetsReady ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><Image className={`size-5 ${allAssetsReady ? 'text-emerald-700' : 'text-slate-400'}`} /><p className="mt-3 text-sm font-semibold text-slate-900">Identidade visual</p><p className="mt-1 text-xs text-slate-500">{deployment.assets.filter((asset) => asset.status === 'confirmed').length} de 5 imagens confirmadas</p></div><div className={`rounded-lg border p-4 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><ShieldCheck className={`size-5 ${ready ? 'text-emerald-700' : 'text-slate-400'}`} /><p className="mt-3 text-sm font-semibold text-slate-900">Validações concluídas</p><p className="mt-1 text-xs text-slate-500">Hub, tenant e importação</p></div></div></section>

        <section className="overflow-hidden rounded-xl border border-[#dbe3ef] bg-white"><div className="border-b border-[#dbe3ef] px-5 py-4 sm:px-6"><h2 className="text-base font-semibold text-slate-950">Tenants que serão ativados</h2><p className="mt-0.5 text-xs text-slate-500">Confira o vínculo de cada unidade antes da publicação.</p></div><div className="divide-y divide-[#dbe3ef]">{deployment.units.map((unit) => <article key={unit.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Store className="size-5" /></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-950">{unit.name}</h3><p className="mt-1 text-xs text-slate-500">{unit.code} · {unit.isInitial ? 'Unidade inicial' : 'Filial'} · Alpha7 #{unit.sourceUnitId}</p></div></div><div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-right"><div><p className="text-slate-400">Tenant</p><p className="mt-0.5 truncate font-mono font-semibold text-slate-700">{unit.unicommerceTenantId || '—'}</p></div><div><p className="text-slate-400">Itens válidos</p><p className="mt-0.5 font-semibold tabular-nums text-slate-700">{unit.latestValidRows?.toLocaleString('pt-BR') || '—'}</p></div></div></article>)}</div></section>

        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 sm:p-6"><div className="flex gap-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800"><FileCheck2 className="size-5" /></span><div><h2 className="text-base font-semibold text-amber-950">O que acontece ao ativar?</h2><p className="mt-2 text-sm leading-6 text-amber-900">Os tenants deixam o modo inativo e passam a disponibilizar o catálogo já validado. A aprovação ficará registrada em nome de <strong>{requestedBy}</strong>.</p><p className="mt-2 text-xs text-amber-800">Esta operação não deve ser repetida enquanto estiver sendo processada.</p></div></div></section>
      </div>

      <aside className="h-fit rounded-xl border border-[#dbe3ef] bg-white p-5 lg:sticky lg:top-6"><div className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-6" /></div><h2 className="mt-4 text-lg font-semibold tracking-[-0.025em] text-slate-950">Pronto para publicar</h2><p className="mt-1 text-sm leading-6 text-slate-500">Todos os critérios precisam estar verdes antes da ativação.</p><ul className="mt-5 space-y-3 text-sm">{[
        { ok: ready, label: 'Status aguardando ativação' },
        { ok: allUnitsReady, label: `${deployment.units.length} unidades preparadas` },
        { ok: allAssetsReady, label: '5 imagens confirmadas' },
        { ok: !deployment.lastErrorCode, label: 'Sem erros pendentes' },
      ].map((item) => <li key={item.label} className="flex items-center gap-2.5"><span className={`flex size-5 items-center justify-center rounded-full ${item.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}><Check className="size-3" /></span><span className={item.ok ? 'text-slate-700' : 'text-slate-400'}>{item.label}</span></li>)}</ul><label className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={!ready} className="mt-0.5 size-4 accent-[#145efc]" /><span className="text-xs leading-5 text-slate-600">Revisei as unidades e confirmo a ativação dos tenants listados.</span></label>{error ? <p className="mt-3 text-xs font-medium text-rose-600">{error}</p> : null}<button type="button" onClick={() => void handleActivation()} disabled={!ready || !allUnitsReady || !allAssetsReady || !confirmed || activating} className={`${primaryButtonClass} mt-4 w-full`}>{activating ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{activating ? 'Ativando tenants…' : 'Ativar tenants'}</button><Link to={`/main/catalogo/${deployment.id}`} className={`${secondaryButtonClass} mt-3 w-full`}>Voltar ao acompanhamento</Link><p className="mt-5 border-t border-slate-200 pt-4 text-center text-[11px] text-slate-400">Rascunho criado em {formatDate(deployment.createdAt)}</p>
      </aside>
    </div></main>
  </CatalogScreen>;
}
