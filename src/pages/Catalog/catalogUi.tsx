/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, CircleDashed, Clock3, FlaskConical, TriangleAlert, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATALOG_DEMO_MODE, type DeploymentStatus, type UnitStatus } from '../../services/catalogDeployment.service';

export const fieldClass = 'mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-slate-100 disabled:text-slate-500';
export const labelClass = 'block text-sm font-medium text-slate-700';
export const primaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition hover:bg-[#0f50df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-slate-300';
export const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50';

const STATUS_LABELS: Record<DeploymentStatus | UnitStatus, string> = {
  draft: 'Rascunho', queued: 'Na fila', provisioning_hub: 'Criando no Hub', validating_hub_catalog: 'Validando catálogo',
  provisioning_unicommerce: 'Criando Unicommerce', validating_unicommerce: 'Validando Unicommerce', importing_banco_unico: 'Importando produtos',
  awaiting_activation: 'Aguardando ativação', completed: 'Concluído', partially_failed: 'Concluído com ressalvas', failed: 'Falhou',
  monitoring_timeout: 'Tempo de monitoramento excedido', reconciliation_required: 'Reconciliação necessária', cancelled: 'Cancelado',
  pending: 'Pendente', hub_unit_created: 'Unidade criada no Hub', integration_created: 'Integração criada', scheduled: 'Carga agendada',
  running: 'Carga em andamento', shadow_ready: 'Snapshot pronto', catalog_active: 'Catálogo validado',
  unicommerce_tenant_created: 'Tenant criado', unicommerce_ready: 'Unicommerce pronto', banco_unico_importing: 'Importando no Banco Único', active: 'Ativa',
};

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'orange';

export function statusTone(status: DeploymentStatus | UnitStatus): Tone {
  if (['completed', 'catalog_active', 'unicommerce_ready', 'active'].includes(status)) return 'success';
  if (['failed'].includes(status)) return 'danger';
  if (['partially_failed', 'reconciliation_required'].includes(status)) return 'orange';
  if (['awaiting_activation', 'monitoring_timeout'].includes(status)) return 'warning';
  if (['queued', 'scheduled', 'running', 'provisioning_hub', 'validating_hub_catalog', 'provisioning_unicommerce', 'validating_unicommerce', 'importing_banco_unico', 'hub_unit_created', 'integration_created', 'shadow_ready', 'unicommerce_tenant_created', 'banco_unico_importing'].includes(status)) return 'info';
  return 'neutral';
}

const toneClasses: Record<Tone, string> = {
  neutral: 'border-slate-200 bg-slate-100 text-slate-600',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
};

export function statusLabel(status: DeploymentStatus | UnitStatus) {
  return STATUS_LABELS[status] || status;
}

export function StatusBadge({ status }: { status: DeploymentStatus | UnitStatus }) {
  const tone = statusTone(status);
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : tone === 'warning' || tone === 'orange' ? TriangleAlert : tone === 'info' ? CircleDashed : Clock3;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}><Icon className={`size-3.5 ${tone === 'info' ? 'animate-spin [animation-duration:2.5s]' : ''}`} />{statusLabel(status)}</span>;
}

export function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatDate(value: string | null, includeTime = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', ...(includeTime ? { timeStyle: 'short' } : {}) }).format(new Date(value));
}

export function CatalogPageHeader({ title, description, action, backTo }: { title: string; description: string; action?: ReactNode; backTo?: string }) {
  return (
    <header className="shrink-0 border-b border-[#dbe3ef] bg-white px-5 py-4 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {backTo ? <Link to={backTo} aria-label="Voltar" className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"><ArrowLeft className="size-4" /></Link> : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold tracking-[-0.025em] text-slate-950">{title}</h1>
              {CATALOG_DEMO_MODE ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"><FlaskConical className="size-3" />Demonstração</span> : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
    </header>
  );
}

export function CatalogScreen({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f8fafc] font-sans text-slate-950">{children}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center"><span className="flex size-12 items-center justify-center rounded-full bg-slate-100"><CircleDashed className="size-6 text-slate-500" /></span><h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2><p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>{action ? <div className="mt-5">{action}</div> : null}</div>;
}
