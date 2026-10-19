import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Database, Eye, EyeOff, Info, Loader2, LockKeyhole, Save, ShieldCheck, Store } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { catalogErp, catalogErpName, getDeployment, updateDeploymentUnit, type Deployment, type DeploymentUnit, type UpdateDeploymentUnitPayload } from '../../services/catalogDeployment.service';
import { databaseConnectionPayloadFromUrl } from '../../services/database.service';
import { getAuthSession } from '../../utils/authSession';
import { CatalogPageHeader, CatalogScreen, EmptyState, fieldClass, formatCnpj, labelClass, primaryButtonClass, secondaryButtonClass, StatusBadge } from './catalogUi';
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
  return message ? <p className="mt-1.5 text-xs font-medium text-rose-600">{message}</p> : null;
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
    await checkConnection(unit.id, { driver: erp.databaseDriver, credentialRef: form.credentialRef, cnpj: form.cnpj, sourceUnitId: Number(form.sourceUnitId) });
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

  return <CatalogScreen>
    <CatalogPageHeader title="Corrigir dados da implantação" description={`${deployment.groupName} · ${formatCnpj(deployment.groupCnpj)}`} backTo={`/main/catalogo/${deployment.id}`} />
    <main className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-10 lg:py-8">
        <aside className="h-fit rounded-xl border border-[#dbe3ef] bg-white lg:sticky lg:top-6">
          <div className="border-b border-[#dbe3ef] px-5 py-4"><h2 className="text-sm font-semibold text-slate-950">Escolha a unidade</h2><p className="mt-1 text-xs leading-5 text-slate-500">As alterações são salvas separadamente por filial.</p></div>
          <div className="p-2">{deployment.units.map((item) => <button key={item.id} type="button" onClick={() => chooseUnit(item)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${selectedId === item.id ? 'bg-blue-50 text-primary' : 'text-slate-700 hover:bg-slate-50'}`}><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${selectedId === item.id ? 'bg-white text-primary' : 'bg-slate-100 text-slate-500'}`}><Store className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.name}</span><span className="mt-0.5 block truncate text-xs opacity-70">{item.code} · {catalogErpName(item.erpId, item.provider)}{item.sourceUnitId ? ` ${item.sourceUnitId}` : ''}</span></span></button>)}</div>
        </aside>

        {unit && form ? <form onSubmit={submit} className="min-w-0 space-y-5">
          {!canEdit ? <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><Info className="mt-0.5 size-5 shrink-0 text-amber-700" /><p>Esta implantação está em processamento ou já foi ativada. Aguarde a execução terminar para corrigir os dados com segurança.</p></div> : null}
          {saved ? <div role="status" className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700" /><div><p className="text-sm font-semibold text-emerald-950">Correções salvas</p><p className="mt-0.5 text-xs leading-5 text-emerald-800">Os dados protegidos foram atualizados. Volte ao acompanhamento e escolha “Tentar novamente” para retomar a implantação.</p></div></div><Link to={`/main/catalogo/${deployment.id}`} className={secondaryButtonClass}>Voltar ao acompanhamento</Link></div> : null}
          {submitError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{submitError}</div> : null}

          <section className="rounded-xl border border-[#dbe3ef] bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#dbe3ef] px-5 py-5 sm:px-6"><div><h1 className="text-lg font-semibold tracking-[-0.025em] text-slate-950">{unit.name}</h1><p className="mt-1 text-sm text-slate-500">Revise apenas o que estiver incorreto. Campos em branco de acesso mantêm o valor atual.</p></div><StatusBadge status={unit.status} /></div>
            <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-6">
              <label className={labelClass}>Código da unidade<input value={form.codigo} onChange={(event) => change('codigo', event.target.value.toUpperCase())} className={fieldClass} maxLength={100} disabled={!canEdit || identityLocked} aria-invalid={Boolean(errors.codigo)} /><FieldError message={errors.codigo} /></label>
              <label className={labelClass}>Nome da unidade<input value={form.nome} onChange={(event) => change('nome', event.target.value)} className={fieldClass} maxLength={255} disabled={!canEdit || identityLocked} aria-invalid={Boolean(errors.nome)} /><FieldError message={errors.nome} /></label>
              <label className={labelClass}>CNPJ da unidade<input value={form.cnpj} onChange={(event) => change('cnpj', formatCnpj(event.target.value))} className={fieldClass} inputMode="numeric" disabled={!canEdit || identityLocked} aria-invalid={Boolean(errors.cnpj)} /><FieldError message={errors.cnpj} /></label>
              <label className={labelClass}>ERP integrado<input value={`${unit.erpId} — ${catalogErpName(unit.erpId, unit.provider)}`} className={`${fieldClass} bg-slate-100`} disabled /><p className="mt-1.5 text-xs text-slate-500">O ERP é imutável após a criação do rascunho.</p></label>
              {erp?.sourceUnitLabel ? <label className={labelClass}>{erp.sourceUnitLabel}<input value={form.sourceUnitId} onChange={(event) => change('sourceUnitId', event.target.value)} className={fieldClass} type="number" min={1} step={1} disabled={!canEdit || sourceLocked} aria-invalid={Boolean(errors.sourceUnitId)} /><FieldError message={errors.sourceUnitId} /></label> : null}
              {erp?.id === 2 ? <div className="flex gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 text-xs leading-5 text-violet-900"><Info className="mt-0.5 size-4 shrink-0" /><p>A origem Linx é localizada pelo CNPJ da unidade, sem ID de origem ou credencial.</p></div> : null}
              {(identityLocked || sourceLocked) ? <div className="flex gap-3 rounded-lg bg-slate-100 p-4 text-xs leading-5 text-slate-600 sm:col-span-2"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-slate-500" /><p>Os identificadores bloqueados já foram usados para criar recursos no Hub. Mantê-los fixos evita que esta implantação passe a apontar para outra filial.</p></div> : null}
            </div>
          </section>

          <section className="rounded-xl border border-[#dbe3ef] bg-white">
            <div className="border-b border-[#dbe3ef] px-5 py-5 sm:px-6"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-primary"><Database className="size-5" /></span><div><h2 className="text-base font-semibold text-slate-950">Conexão e carga</h2><p className="mt-1 text-sm leading-6 text-slate-500">Esses dados podem ser corrigidos mesmo quando a integração já existe.</p></div></div></div>
            <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-6">
              {erp?.databaseDriver ? <label className={`${labelClass} sm:col-span-2`}>Nova conexão {erp.databaseName} <span className="font-normal text-slate-400">(opcional; validação obrigatória quando preenchida)</span>
                <div className="flex items-start gap-2"><div className="relative min-w-0 flex-1"><input value={form.credentialRef} onChange={(event) => change('credentialRef', event.target.value)} className={`${fieldClass} pr-12 font-mono text-xs`} type={showCredential ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} disabled={!canEdit} placeholder={unit.hasCredential ? 'Deixe em branco para manter a conexão atual' : erp.databaseDriver === 'mysql' ? 'mysql://usuario:senha@host:3306/database' : 'postgresql://usuario:senha@host:5432/database'} aria-invalid={Boolean(errors.credentialRef)} /><button type="button" onClick={() => setShowCredential((current) => !current)} className="absolute right-1.5 top-1/2 mt-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary" aria-label={showCredential ? 'Ocultar conexão' : 'Mostrar conexão'} disabled={!canEdit}>{showCredential ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><button type="button" onClick={() => void validateConnection()} disabled={!canEdit || connectionCheck.state === 'validating' || !form.credentialRef.trim() || !isValidCnpj(form.cnpj) || !Number.isSafeInteger(Number(form.sourceUnitId)) || Number(form.sourceUnitId) <= 0} className={`mt-2 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${connectionCheck.state === 'valid' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{connectionCheck.state === 'validating' ? <Loader2 className="size-4 animate-spin" /> : connectionCheck.state === 'valid' ? <CheckCircle2 className="size-4" /> : null}Validar</button></div>
                <p className="mt-1.5 text-xs leading-5 text-slate-500">{unit.hasCredential ? 'Existe uma conexão protegida. Por segurança, ela não é exibida.' : 'Nenhuma conexão foi configurada.'} {erp.id === 3 ? 'O teste confirma que o ID da loja no MySQL corresponde ao CNPJ informado.' : 'O teste da nova URL é executado pelo servidor autorizado a acessar os bancos.'}</p>{connectionCheck.message ? <p className={`mt-1.5 text-xs font-medium ${connectionCheck.state === 'valid' ? 'text-emerald-700' : 'text-rose-600'}`}>{connectionCheck.message}</p> : null}<FieldError message={errors.credentialRef} />
              </label> : null}
              {erp?.id === 4 ? <label className={`${labelClass} sm:col-span-2`}>Nova API key do Vetor <span className="font-normal text-slate-400">(opcional)</span><div className="relative"><input value={form.vetorApiKey} onChange={(event) => change('vetorApiKey', event.target.value)} className={`${fieldClass} pr-12 font-mono text-xs`} type={showCredential ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={2048} disabled={!canEdit} placeholder={unit.hasCredential ? 'Deixe em branco para manter a API key atual' : 'Informe a API key do Vetor'} aria-invalid={Boolean(errors.vetorApiKey)} /><button type="button" onClick={() => setShowCredential((current) => !current)} className="absolute right-1.5 top-1/2 mt-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary" aria-label={showCredential ? 'Ocultar API key' : 'Mostrar API key'} disabled={!canEdit}>{showCredential ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><p className="mt-1.5 text-xs leading-5 text-slate-500">{unit.hasCredential ? 'Existe uma API key protegida. Deixe em branco para mantê-la.' : 'Nenhuma API key foi configurada.'} A chave salva não é exibida.</p><FieldError message={errors.vetorApiKey} /></label> : null}
              {erp?.id === 2 ? <div className="flex gap-3 rounded-lg bg-violet-50 p-4 text-xs leading-5 text-violet-900 sm:col-span-2"><Info className="mt-0.5 size-4 shrink-0" /><p>Linx não utiliza conexão com banco nem API key. O Hub localizará a origem pelo CNPJ <strong>{formatCnpj(unit.cnpj)}</strong>.</p></div> : null}
              {deployment.flowMode === 'full' ? <label className={`${labelClass} sm:col-span-2`}>Novo webhook de pedidos <span className="font-normal text-slate-400">(opcional)</span><input value={form.orderWebhookUrl} onChange={(event) => change('orderWebhookUrl', event.target.value)} className={fieldClass} type="url" inputMode="url" maxLength={2048} autoCapitalize="none" autoComplete="off" spellCheck={false} disabled={!canEdit} placeholder={unit.hasOrderWebhookUrl ? 'Deixe em branco para manter o webhook atual' : 'https://api.exemplo.com/webhooks/pedidos'} aria-invalid={Boolean(errors.orderWebhookUrl)} /><p className="mt-1.5 text-xs leading-5 text-slate-500">{unit.hasOrderWebhookUrl ? 'Existe um webhook protegido. Por segurança, ele não é exibido.' : 'Nenhum webhook foi configurado.'}</p><FieldError message={errors.orderWebhookUrl} /></label> : null}
              <label className={labelClass}>Itens por página<input value={form.pageSize} onChange={(event) => change('pageSize', event.target.value)} className={fieldClass} type="number" min={1} max={500} disabled={!canEdit || unit.erpId === 2} aria-invalid={Boolean(errors.pageSize)} /><FieldError message={errors.pageSize} /></label>
              <label className={labelClass}>Limite de queda de EAN (bps)<input value={form.validEanDropThresholdBps} onChange={(event) => change('validEanDropThresholdBps', event.target.value)} className={fieldClass} type="number" min={0} max={10000} disabled={!canEdit || unit.erpId === 2} aria-invalid={Boolean(errors.validEanDropThresholdBps)} /><FieldError message={errors.validEanDropThresholdBps} /></label>
              <div className="flex gap-3 rounded-lg bg-blue-50 p-4 text-xs leading-5 text-blue-800 sm:col-span-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><p>{erp?.id === 2 ? 'A integração Linx localiza a unidade pelo CNPJ, sem credencial de origem.' : 'As credenciais são protegidas e nunca aparecem nas respostas da API ou na linha do tempo. Deixe os campos de acesso em branco para manter os valores atuais.'}</p></div>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 rounded-xl border border-[#dbe3ef] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-xs leading-5 text-slate-500">Salvar não inicia a carga automaticamente.</p><div className="flex flex-col-reverse gap-3 sm:flex-row"><Link to={`/main/catalogo/${deployment.id}`} className={secondaryButtonClass}>Cancelar</Link><button type="submit" disabled={!canEdit || saving} className={primaryButtonClass}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? 'Salvando correções…' : 'Salvar correções'}</button></div></div>
        </form> : <EmptyState title="Nenhuma unidade encontrada" description="Esta implantação não possui unidades para editar." />}
      </div>
    </main>
  </CatalogScreen>;
}
