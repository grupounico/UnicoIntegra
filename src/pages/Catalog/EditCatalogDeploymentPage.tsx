import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Info, Loader2, LockKeyhole, Save, TriangleAlert } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { catalogErp, catalogErpName, getDeployment, updateDeploymentUnit, type Deployment, type DeploymentUnit, type UpdateDeploymentUnitPayload } from '../../services/catalogDeployment.service';
import { databaseConnectionPayloadFromUrl } from '../../services/database.service';
import { getAuthSession } from '../../utils/authSession';
import { CatalogPageHeader, CatalogScreen, EmptyState, StatusDot, fieldClass, formatCnpj, labelClass, primaryButtonClass, secondaryButtonClass } from './catalogUi';
import DatabaseConnectionFields from './DatabaseConnectionFields';
import { hasValidCatalogConnection, useCatalogConnectionChecks } from './useCatalogConnectionChecks';

type UnitForm = {
  codigo: string;
  nome: string;
  cnpj: string;
  sourceUnitId: string;
  credentialRef: string;
  vetorApiKey: string;
  orderWebhookUrl: string;
  pageSize: string;
  validEanDropThresholdBps: string;
};

type FormErrors = Partial<Record<keyof UnitForm, string>>;
const editableStatuses = new Set(['draft', 'failed', 'partially_failed', 'monitoring_timeout', 'reconciliation_required']);

function formFromUnit(unit: DeploymentUnit): UnitForm {
  return {
    codigo: unit.code,
    nome: unit.name,
    cnpj: formatCnpj(unit.cnpj),
    sourceUnitId: unit.sourceUnitId == null ? '' : String(unit.sourceUnitId),
    credentialRef: '',
    vetorApiKey: '',
    orderWebhookUrl: '',
    pageSize: String(unit.pageSize),
    validEanDropThresholdBps: String(unit.validEanDropThresholdBps),
  };
}

function isValidCnpj(value: string) {
  const cnpj = value.replace(/\D/g, '');
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digit = (length: number) => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cnpj[index]) * weight;
      weight -= 1;
      if (weight === 1) weight = 9;
    }
    const result = 11 - (sum % 11);
    return result >= 10 ? 0 : result;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

function validate(form: UnitForm, unit: DeploymentUnit, identityLocked: boolean, sourceLocked: boolean) {
  const errors: FormErrors = {};
  const erp = catalogErp(unit.erpId, unit.provider);
  if (!identityLocked) {
    if (form.codigo.trim() !== unit.code && !form.codigo.trim()) errors.codigo = 'Informe o código da unidade.';
    if (form.nome.trim() !== unit.name && !form.nome.trim()) errors.nome = 'Informe o nome da unidade.';
    if (form.cnpj.replace(/\D/g, '') !== unit.cnpj && !isValidCnpj(form.cnpj)) errors.cnpj = 'Informe um CNPJ válido.';
  }
  if (erp?.sourceUnitLabel && !sourceLocked && (!Number.isSafeInteger(Number(form.sourceUnitId)) || Number(form.sourceUnitId) <= 0)) errors.sourceUnitId = 'Use um número inteiro positivo.';
  if (erp?.databaseDriver && form.credentialRef.trim()) {
    try {
      databaseConnectionPayloadFromUrl(form.credentialRef, form.cnpj, { driver: erp.databaseDriver, sourceUnitId: Number(form.sourceUnitId) });
    } catch { errors.credentialRef = `Use uma URL ${erp.databaseName} completa e válida, incluindo usuário e senha.`; }
  }
  if (erp?.databaseDriver && !form.credentialRef.trim() && !unit.hasCredential) errors.credentialRef = 'Informe e valide a conexão com o banco.';
  if (erp?.id === 4 && ((!unit.hasCredential && !form.vetorApiKey.trim()) || (form.vetorApiKey.trim() && (form.vetorApiKey.trim().length < 8 || form.vetorApiKey.trim().length > 2048 || /[\r\n]/.test(form.vetorApiKey))))) {
    errors.vetorApiKey = 'Informe uma API key do Vetor entre 8 e 2048 caracteres, sem quebras de linha.';
  }
  if (form.orderWebhookUrl.trim()) {
    try {
      const url = new URL(form.orderWebhookUrl.trim());
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || form.orderWebhookUrl.trim().length > 2048) throw new Error();
    } catch { errors.orderWebhookUrl = 'Use uma URL HTTPS válida, sem usuário ou senha.'; }
  }
  const pageSize = Number(form.pageSize);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) errors.pageSize = 'Use um valor entre 1 e 500.';
  const threshold = Number(form.validEanDropThresholdBps);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10000) errors.validEanDropThresholdBps = 'Use um valor entre 0 e 10000.';
  return errors;
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs font-medium text-rose-700">{message}</p> : null;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs leading-5 text-slate-500">{children}</p>;
}

function Optional() {
  return <span className="ml-1 font-normal text-slate-500">opcional</span>;
}

function Locked() {
  return <LockKeyhole aria-label="Bloqueado" className="ml-1.5 inline size-3.5 -translate-y-px text-slate-500" />;
}

// Stacked settings card: heading and description on top, fields below.
function FormSection({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white">
    <header className="border-b border-slate-200 px-5 py-4 sm:px-6"><h2 className="text-base font-semibold text-slate-950">{title}</h2><div className="mt-0.5 text-sm leading-6 text-slate-600">{description}</div></header>
    <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">{children}</div>
  </section>;
}

function Notice({ tone, children }: { tone: 'success' | 'error' | 'warning'; children: React.ReactNode }) {
  const styles = { success: 'border-emerald-200 bg-emerald-50 text-emerald-900', error: 'border-rose-200 bg-rose-50 text-rose-900', warning: 'border-amber-200 bg-amber-50 text-amber-900' }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? TriangleAlert : Info;
  const iconTone = { success: 'text-emerald-600', error: 'text-rose-600', warning: 'text-amber-600' }[tone];
  return <div role={tone === 'success' ? 'status' : 'alert'} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm leading-6 ${styles}`}><Icon aria-hidden="true" className={`mt-1 size-4 shrink-0 ${iconTone}`} /><div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</div></div>;
}

export default function EditCatalogDeploymentPage() {
  const { deploymentId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = getAuthSession();
  const requestedBy = session?.username || session?.authUsername || 'Operador Unico';
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('unit') || '');
  const [form, setForm] = useState<UnitForm | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showCredential, setShowCredential] = useState(false);
  const { checks: connectionChecks, invalidate: invalidateConnection, validateConnection: checkConnection } = useCatalogConnectionChecks();

  const load = useCallback(async () => {
    if (!deploymentId) return;
    setLoading(true);
    try {
      const result = await getDeployment(deploymentId);
      setDeployment(result);
      const preferred = result.units.find((unit) => unit.id === searchParams.get('unit'))
        || result.units.find((unit) => unit.status === 'failed')
        || result.units[0];
      setSelectedId(preferred?.id || '');
      setForm(preferred ? formFromUnit(preferred) : null);
      result.units.forEach((item) => invalidateConnection(item.id));
      setLoadError('');
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Não foi possível carregar a implantação.');
    } finally { setLoading(false); }
  }, [deploymentId, searchParams, invalidateConnection]);

  useEffect(() => { void load(); }, [load]);

  const unit = useMemo(() => deployment?.units.find((item) => item.id === selectedId) || null, [deployment, selectedId]);
  const erp = unit ? catalogErp(unit.erpId, unit.provider) : undefined;
  const connectionCheck = connectionChecks[selectedId] || { state: 'idle' as const };
  const identityLocked = Boolean(unit?.hubSellerUnitId);
  const sourceLocked = Boolean(unit?.hubIntegrationId);
  const canEdit = Boolean(deployment && editableStatuses.has(deployment.status));

  function chooseUnit(next: DeploymentUnit) {
    invalidateConnection(selectedId);
    invalidateConnection(next.id);
    setSelectedId(next.id);
    setSearchParams({ unit: next.id }, { replace: true });
    setForm(formFromUnit(next));
    setErrors({});
    setSubmitError('');
    setSaved(false);
    setShowCredential(false);
  }

  function change<K extends keyof UnitForm>(field: K, value: UnitForm[K]) {
    setForm((current) => current ? { ...current, [field]: value } : current);
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === 'credentialRef' || field === 'cnpj' || field === 'sourceUnitId') invalidateConnection(selectedId);
    setSaved(false);
  }

  async function validateConnection() {
    if (!form || !unit || !erp?.databaseDriver) return;
    setErrors((current) => ({ ...current, credentialRef: undefined }));
    await checkConnection(unit.id, { driver: erp.databaseDriver, credentialRef: form.credentialRef, cnpj: form.cnpj, sourceUnitId: Number(form.sourceUnitId) }, (connection) => change('credentialRef', connection));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!deployment || !unit || !form || !canEdit) return;
    const nextErrors = validate(form, unit, identityLocked, sourceLocked);
    if (erp?.databaseDriver && form.credentialRef.trim()
      && !hasValidCatalogConnection(connectionCheck, { driver: erp.databaseDriver, credentialRef: form.credentialRef, cnpj: form.cnpj, sourceUnitId: Number(form.sourceUnitId) })) {
      nextErrors.credentialRef = 'Valide a nova conexão com o banco antes de salvar.';
    }
    if (erp?.id === 1 && deployment.units.some((item) => item.id !== unit.id && item.erpId === 1 && item.sourceUnitId === Number(form.sourceUnitId))) nextErrors.sourceUnitId = 'Este ID já está em uso por outra unidade Alpha7.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const payload: UpdateDeploymentUnitPayload = {
      requestedBy,
      ...(!identityLocked && form.codigo.trim() !== unit.code ? { codigo: form.codigo.trim() } : {}),
      ...(!identityLocked && form.nome.trim() !== unit.name ? { nome: form.nome.trim() } : {}),
      ...(!identityLocked && form.cnpj.replace(/\D/g, '') !== unit.cnpj ? { cnpj: form.cnpj.replace(/\D/g, '') } : {}),
      ...(erp?.sourceUnitLabel && !sourceLocked && Number(form.sourceUnitId) !== unit.sourceUnitId ? { sourceUnitId: Number(form.sourceUnitId) } : {}),
      ...(erp?.databaseDriver && form.credentialRef.trim() ? { credentialRef: form.credentialRef.trim() } : {}),
      ...(erp?.id === 4 && form.vetorApiKey.trim() ? { vetorApiKey: form.vetorApiKey.trim() } : {}),
      ...(deployment.flowMode === 'full' && form.orderWebhookUrl.trim() ? { orderWebhookUrl: form.orderWebhookUrl.trim() } : {}),
      pageSize: Number(form.pageSize),
      validEanDropThresholdBps: Number(form.validEanDropThresholdBps),
    };
    setSaving(true);
    setSubmitError('');
    try {
      const updated = await updateDeploymentUnit(deployment.id, unit.id, payload);
      const updatedUnit = updated.units.find((item) => item.id === unit.id);
      setDeployment(updated);
      setForm(updatedUnit ? formFromUnit(updatedUnit) : form);
      invalidateConnection(unit.id);
      setSaved(true);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Não foi possível salvar as correções.');
    } finally { setSaving(false); }
  }

  if (loading) return <CatalogScreen><CatalogPageHeader title="Corrigir dados" description="Carregando a configuração da implantação…" backTo={`/main/catalogo/${deploymentId}`} /><div className="flex flex-1 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div></CatalogScreen>;
  if (loadError || !deployment) return <CatalogScreen><CatalogPageHeader title="Correção indisponível" description="Não foi possível abrir esta implantação." backTo={`/main/catalogo/${deploymentId}`} /><main className="p-8"><EmptyState title="Não foi possível carregar" description={loadError || 'Implantação não encontrada.'} action={<button type="button" onClick={() => void load()} className={primaryButtonClass}>Tentar novamente</button>} /></main></CatalogScreen>;

  const revealButton = (label: string) => <button type="button" onClick={() => setShowCredential((current) => !current)} className="absolute right-1.5 top-1/2 mt-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-50" aria-label={showCredential ? `Ocultar ${label}` : `Mostrar ${label}`} disabled={!canEdit}>{showCredential ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>;
  const threshold = Number(form?.validEanDropThresholdBps);

  return <CatalogScreen>
    <CatalogPageHeader title="Corrigir dados" description={`${deployment.groupName} · ${formatCnpj(deployment.groupCnpj)}`} backTo={`/main/catalogo/${deployment.id}`} />
    <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto w-full max-w-3xl px-5 pt-6 sm:px-8">
        {deployment.units.length > 1 ? <nav aria-label="Unidades da implantação" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_theme(colors.slate.200)] [scrollbar-width:none]">
          {deployment.units.map((item) => {
            const active = selectedId === item.id;
            return <button key={item.id} type="button" onClick={() => chooseUnit(item)} aria-current={active ? 'page' : undefined} className={`relative flex max-w-[15rem] shrink-0 flex-col items-start rounded-t-md px-3 pb-3 pt-1 text-left transition focus-visible:outline-2 focus-visible:outline-primary ${active ? 'text-slate-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-slate-600 hover:text-slate-950'}`}>
              <span className="flex max-w-full items-center gap-1.5 text-sm font-medium">{item.status === 'failed' || item.lastErrorCode ? <span aria-label="Com falha" className="size-1.5 shrink-0 rounded-full bg-rose-500" /> : null}<span className="truncate" title={item.name}>{item.name}</span></span>
              <span className="max-w-full truncate text-xs text-slate-500">{item.code} · {catalogErpName(item.erpId, item.provider)}</span>
            </button>;
          })}
        </nav> : null}

        {unit && form ? <form onSubmit={submit} noValidate>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0"><h1 className="text-xl font-semibold tracking-[-0.025em] text-slate-950 [overflow-wrap:anywhere]">{unit.name}</h1><p className="mt-0.5 text-sm text-slate-600">Altere só o que estiver incorreto. Campos de acesso em branco mantêm o valor salvo.</p></div>
            <span className="mt-1.5 shrink-0"><StatusDot status={unit.status} /></span>
          </div>

          {!canEdit || saved || submitError || unit.lastErrorMessage ? <div className="mt-5 space-y-3">
            {!canEdit ? <Notice tone="warning">A implantação está em processamento ou já foi ativada. Aguarde a execução terminar para corrigir os dados.</Notice> : null}
            {unit.lastErrorMessage && !saved ? <Notice tone="error"><span className="font-medium">Último erro desta unidade:</span> {unit.lastErrorMessage}</Notice> : null}
            {saved ? <Notice tone="success"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p><span className="font-medium">Correções salvas.</span> Retome a implantação pelo acompanhamento.</p><Link to={`/main/catalogo/${deployment.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded font-semibold text-emerald-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-700">Ir para o acompanhamento<ArrowRight className="size-4" /></Link></div></Notice> : null}
            {submitError ? <Notice tone="error">{submitError}</Notice> : null}
          </div> : null}

          <div className="mt-6 space-y-5">
            <FormSection title="Dados da unidade" description={identityLocked || sourceLocked ? 'Campos com cadeado já foram usados para criar recursos no Hub e não podem mudar.' : erp?.id === 2 ? 'A origem Linx é localizada pelo CNPJ da unidade, sem ID nem credencial.' : 'Identificação da unidade e origem do catálogo.'}>
              <label className={labelClass}>Código da unidade{identityLocked ? <Locked /> : null}<input value={form.codigo} onChange={(event) => change('codigo', event.target.value.toUpperCase())} className={fieldClass} maxLength={100} disabled={!canEdit || identityLocked} aria-invalid={Boolean(errors.codigo)} /><FieldError message={errors.codigo} /></label>
              <label className={labelClass}>CNPJ da unidade{identityLocked ? <Locked /> : null}<input value={form.cnpj} onChange={(event) => change('cnpj', formatCnpj(event.target.value))} className={`${fieldClass} tabular-nums`} inputMode="numeric" disabled={!canEdit || identityLocked} aria-invalid={Boolean(errors.cnpj)} /><FieldError message={errors.cnpj} /></label>
              <label className={`${labelClass} sm:col-span-2`}>Nome da unidade{identityLocked ? <Locked /> : null}<input value={form.nome} onChange={(event) => change('nome', event.target.value)} className={fieldClass} maxLength={255} disabled={!canEdit || identityLocked} aria-invalid={Boolean(errors.nome)} /><FieldError message={errors.nome} /></label>
              <label className={labelClass}>ERP integrado<Locked /><input value={catalogErpName(unit.erpId, unit.provider)} className={fieldClass} disabled readOnly /></label>
              {erp?.sourceUnitLabel ? <label className={labelClass}>{erp.sourceUnitLabel}{sourceLocked ? <Locked /> : null}<input value={form.sourceUnitId} onChange={(event) => change('sourceUnitId', event.target.value)} className={`${fieldClass} tabular-nums`} type="number" min={1} step={1} disabled={!canEdit || sourceLocked} aria-invalid={Boolean(errors.sourceUnitId)} /><FieldError message={errors.sourceUnitId} /></label> : null}
            </FormSection>

            {erp?.databaseDriver || erp?.id === 4 || deployment.flowMode === 'full' ? <FormSection title="Acesso" description="Credenciais salvas nunca são exibidas. Deixe em branco para manter o valor atual.">
              {erp?.databaseDriver ? <div className="sm:col-span-2">
                <p className={labelClass}>Nova conexão {erp.databaseName}<Optional /></p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{unit.hasCredential ? 'Já existe uma conexão salva; deixe em branco para mantê-la.' : 'Nenhuma conexão configurada.'} Uma nova conexão precisa ser validada antes de salvar.</p>
                <div className="mt-3"><DatabaseConnectionFields driver={erp.databaseDriver} value={form.credentialRef} onChange={(connection) => change('credentialRef', connection)} disabled={!canEdit} invalid={Boolean(errors.credentialRef)} keepHint={unit.hasCredential} framed={false} /></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">{connectionCheck.message ? <p role="status" className={`text-xs font-medium ${connectionCheck.state === 'valid' ? 'text-emerald-700' : 'text-rose-700'}`}>{connectionCheck.message}</p> : <p className="text-xs leading-5 text-slate-500">{erp.id === 3 ? 'A validação confirma que o ID da loja no MySQL corresponde ao CNPJ.' : 'O teste roda no servidor autorizado a acessar os bancos.'}</p>}<FieldError message={errors.credentialRef} /></div>
                  <button type="button" onClick={() => void validateConnection()} disabled={!canEdit || connectionCheck.state === 'validating' || !form.credentialRef.trim() || !isValidCnpj(form.cnpj) || !Number.isSafeInteger(Number(form.sourceUnitId)) || Number(form.sourceUnitId) <= 0} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${connectionCheck.state === 'valid' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{connectionCheck.state === 'validating' ? <Loader2 className="size-4 animate-spin" /> : connectionCheck.state === 'valid' ? <CheckCircle2 className="size-4" /> : null}{connectionCheck.state === 'valid' ? 'Conexão validada' : 'Validar conexão'}</button>
                </div>
              </div> : null}
              {erp?.id === 4 ? <div className="sm:col-span-2"><label htmlFor="vetor-key" className={labelClass}>Nova API key do Vetor<Optional /></label><div className="relative"><input id="vetor-key" value={form.vetorApiKey} onChange={(event) => change('vetorApiKey', event.target.value)} className={`${fieldClass} pr-12 font-mono text-xs`} type={showCredential ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={2048} disabled={!canEdit} placeholder={unit.hasCredential ? 'API key salva · em branco para manter' : 'Informe a API key do Vetor'} aria-invalid={Boolean(errors.vetorApiKey)} />{revealButton('API key')}</div><FieldError message={errors.vetorApiKey} /><Hint>{unit.hasCredential ? 'Já existe uma API key salva.' : 'Nenhuma API key configurada.'}</Hint></div> : null}
              {deployment.flowMode === 'full' ? <label className={`${labelClass} sm:col-span-2`}>Novo webhook de pedidos<Optional /><input value={form.orderWebhookUrl} onChange={(event) => change('orderWebhookUrl', event.target.value)} className={fieldClass} type="url" inputMode="url" maxLength={2048} autoCapitalize="none" autoComplete="off" spellCheck={false} disabled={!canEdit} placeholder={unit.hasOrderWebhookUrl ? 'Webhook salvo · em branco para manter' : 'https://api.exemplo.com/webhooks/pedidos'} aria-invalid={Boolean(errors.orderWebhookUrl)} /><FieldError message={errors.orderWebhookUrl} /><Hint>{unit.hasOrderWebhookUrl ? 'Já existe um webhook salvo.' : 'Nenhum webhook configurado.'}</Hint></label> : null}
            </FormSection> : null}

            <FormSection title="Carga" description={unit.erpId === 2 ? 'Definida pela integração Linx; não editável.' : 'Como o Hub pagina a leitura e quando bloqueia uma carga suspeita.'}>
              <label className={labelClass}>Itens por página<input value={form.pageSize} onChange={(event) => change('pageSize', event.target.value)} className={`${fieldClass} tabular-nums`} type="number" min={1} max={500} disabled={!canEdit || unit.erpId === 2} aria-invalid={Boolean(errors.pageSize)} /><FieldError message={errors.pageSize} />{errors.pageSize ? null : <Hint>Entre 1 e 500.</Hint>}</label>
              <label className={labelClass}>Queda máxima de EAN válidos (bps)<input value={form.validEanDropThresholdBps} onChange={(event) => change('validEanDropThresholdBps', event.target.value)} className={`${fieldClass} tabular-nums`} type="number" min={0} max={10000} disabled={!canEdit || unit.erpId === 2} aria-invalid={Boolean(errors.validEanDropThresholdBps)} /><FieldError message={errors.validEanDropThresholdBps} />{errors.validEanDropThresholdBps ? null : <Hint>{Number.isFinite(threshold) && threshold >= 0 && threshold <= 10000 ? `${(threshold / 100).toLocaleString('pt-BR')}% de queda bloqueia a publicação.` : '100 bps = 1%.'}</Hint>}</label>
            </FormSection>
          </div>

          <div className="sticky bottom-0 -mx-5 mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 bg-[#f8fafc] px-5 py-4 sm:-mx-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="text-xs leading-5 text-slate-500">Salvar não inicia a carga automaticamente.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row"><Link to={`/main/catalogo/${deployment.id}`} className={secondaryButtonClass}>Cancelar</Link><button type="submit" disabled={!canEdit || saving} className={primaryButtonClass}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? 'Salvando…' : 'Salvar correções'}</button></div>
          </div>
        </form> : <div className="py-8"><EmptyState title="Nenhuma unidade encontrada" description="Esta implantação não possui unidades para editar." /></div>}
      </div>
    </main>
  </CatalogScreen>;
}
