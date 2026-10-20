import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Info, Loader2, Plus, X } from 'lucide-react';
import { addDeploymentUnit, CATALOG_ERPS, catalogErp, type AddDeploymentUnitPayload, type CatalogErpId, type Deployment } from '../../services/catalogDeployment.service';
import { databaseConnectionPayloadFromUrl } from '../../services/database.service';
import { fieldClass, formatCnpj, labelClass, primaryButtonClass, secondaryButtonClass } from './catalogUi';
import { hasValidCatalogConnection, useCatalogConnectionChecks } from './useCatalogConnectionChecks';

type Props = {
  deployment: Deployment;
  requestedBy: string;
  onClose: () => void;
  onAdded: (deployment: Deployment) => void;
};

type Form = {
  codigo: string;
  nome: string;
  cnpj: string;
  erpId: CatalogErpId | null;
  sourceUnitId: string;
  credentialRef: string;
  vetorApiKey: string;
  orderWebhookUrl: string;
  pageSize: string;
  validEanDropThresholdBps: string;
};

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

function initialForm(): Form {
  return { codigo: '', nome: '', cnpj: '', erpId: null, sourceUnitId: '', credentialRef: '', vetorApiKey: '', orderWebhookUrl: '', pageSize: '500', validEanDropThresholdBps: '1000' };
}

export default function AddCatalogDeploymentUnitDialog({ deployment, requestedBy, onClose, onAdded }: Props) {
  const [form, setForm] = useState<Form>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const requestId = `add-unit-${deployment.id}`;
  const { checks, invalidate, validateConnection: testConnection } = useCatalogConnectionChecks();
  const erp = catalogErp(form.erpId);
  const connectionCheck = checks[requestId] || { state: 'idle' as const };
  const sourceUnitId = Number(form.sourceUnitId);

  function change<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setSubmitError('');
    if (['credentialRef', 'cnpj', 'sourceUnitId'].includes(field)) invalidate(requestId);
  }

  function selectErp(value: string) {
    invalidate(requestId);
    setForm((current) => ({ ...current, erpId: value ? Number(value) as CatalogErpId : null, sourceUnitId: '', credentialRef: '', vetorApiKey: '' }));
    setErrors({});
  }

  async function validateConnection() {
    if (!erp?.databaseDriver) return;
    try {
      databaseConnectionPayloadFromUrl(form.credentialRef, form.cnpj, { driver: erp.databaseDriver, sourceUnitId });
    } catch (caught) {
      setErrors((current) => ({ ...current, credentialRef: caught instanceof Error ? caught.message : 'Informe uma URL de conexão válida.' }));
      return;
    }
    if (!isValidCnpj(form.cnpj) || !Number.isSafeInteger(sourceUnitId) || sourceUnitId <= 0) {
      setErrors((current) => ({ ...current, credentialRef: 'Informe um CNPJ e um ID de origem válidos antes de testar.' }));
      return;
    }
    setErrors((current) => ({ ...current, credentialRef: '' }));
    await testConnection(requestId, { driver: erp.databaseDriver, credentialRef: form.credentialRef, cnpj: form.cnpj, sourceUnitId });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const code = form.codigo.trim().toUpperCase();
    if (!code) next.codigo = 'Informe o código da unidade.';
    else if (deployment.units.some((unit) => unit.code.toLowerCase() === code.toLowerCase())) next.codigo = 'Este código já está em uso neste grupo.';
    if (!form.nome.trim()) next.nome = 'Informe o nome da unidade.';
    if (!isValidCnpj(form.cnpj)) next.cnpj = 'Informe um CNPJ válido.';
    if (!erp) next.erpId = 'Escolha o ERP desta filial.';
    if (erp?.sourceUnitLabel && (!Number.isSafeInteger(sourceUnitId) || sourceUnitId <= 0)) next.sourceUnitId = 'Use um número inteiro positivo.';
    if (erp?.databaseDriver) {
      try { databaseConnectionPayloadFromUrl(form.credentialRef, form.cnpj, { driver: erp.databaseDriver, sourceUnitId }); }
      catch (caught) { next.credentialRef = caught instanceof Error ? caught.message : 'Informe uma URL de conexão válida.'; }
      if (!hasValidCatalogConnection(connectionCheck, { driver: erp.databaseDriver, credentialRef: form.credentialRef, cnpj: form.cnpj, sourceUnitId })) {
        next.credentialRef = 'Valide a conexão antes de adicionar a filial.';
      }
    }
    if (erp?.id === 4 && (form.vetorApiKey.trim().length < 8 || form.vetorApiKey.trim().length > 2048 || /[\r\n]/.test(form.vetorApiKey))) next.vetorApiKey = 'Informe uma API key válida do Vetor.';
    if (deployment.flowMode === 'full') {
      try {
        const url = new URL(form.orderWebhookUrl.trim());
        if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error();
      } catch { next.orderWebhookUrl = 'Informe uma URL HTTPS válida para receber pedidos.'; }
    }
    if (!Number.isInteger(Number(form.pageSize)) || Number(form.pageSize) < 1 || Number(form.pageSize) > 500) next.pageSize = 'Use um valor entre 1 e 500.';
    if (!Number.isInteger(Number(form.validEanDropThresholdBps)) || Number(form.validEanDropThresholdBps) < 0 || Number(form.validEanDropThresholdBps) > 10000) next.validEanDropThresholdBps = 'Use um valor entre 0 e 10000.';
    setErrors(next);
    if (Object.keys(next).length || !erp) return;

    const payload: AddDeploymentUnitPayload = {
      requestedBy,
      codigo: code,
      nome: form.nome.trim(),
      cnpj: form.cnpj.replace(/\D/g, ''),
      erpId: erp.id,
      initial: false,
      orderWebhookUrl: deployment.flowMode === 'full' ? form.orderWebhookUrl.trim() : '',
      pageSize: erp.id === 2 ? 500 : Number(form.pageSize),
      validEanDropThresholdBps: erp.id === 2 ? 1000 : Number(form.validEanDropThresholdBps),
      ...(erp.databaseDriver ? { sourceUnitId, credentialRef: form.credentialRef.trim() } : {}),
      ...(erp.id === 4 ? { sourceUnitId, vetorApiKey: form.vetorApiKey.trim() } : {}),
    };
    setSubmitting(true);
    setSubmitError('');
    try {
      onAdded(await addDeploymentUnit(deployment.id, payload));
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Não foi possível adicionar a unidade.');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="add-unit-title">
    <form onSubmit={(event) => void submit(event)} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#dbe3ef] bg-white px-5 py-5 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">{deployment.groupName}</p><h2 id="add-unit-title" className="mt-1 text-xl font-semibold text-slate-950">Adicionar filial ao grupo</h2><p className="mt-1 text-sm leading-5 text-slate-500">A nova unidade será criada dentro do seller existente e manterá o ERP e os acessos próprios dela.</p></div><button type="button" onClick={onClose} disabled={submitting} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X className="size-4" /></button></div>
      <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-6">
        <label className={labelClass}>Código da unidade<input autoFocus value={form.codigo} onChange={(event) => change('codigo', event.target.value.toUpperCase())} className={fieldClass} maxLength={100} placeholder="FILIAL-02" aria-invalid={Boolean(errors.codigo)} />{errors.codigo ? <span className="mt-1 block text-xs text-rose-600">{errors.codigo}</span> : null}</label>
        <label className={labelClass}>Nome da unidade<input value={form.nome} onChange={(event) => change('nome', event.target.value)} className={fieldClass} maxLength={255} placeholder="Campo Belo filial 02" aria-invalid={Boolean(errors.nome)} />{errors.nome ? <span className="mt-1 block text-xs text-rose-600">{errors.nome}</span> : null}</label>
        <label className={labelClass}>CNPJ da filial<input value={form.cnpj} onChange={(event) => change('cnpj', formatCnpj(event.target.value))} className={fieldClass} inputMode="numeric" placeholder="00.000.000/0000-00" aria-invalid={Boolean(errors.cnpj)} />{errors.cnpj ? <span className="mt-1 block text-xs text-rose-600">{errors.cnpj}</span> : null}</label>
        <label className={labelClass}>ERP integrado<select required value={form.erpId ?? ''} onChange={(event) => selectErp(event.target.value)} className={fieldClass} aria-invalid={Boolean(errors.erpId)}><option value="" disabled>Selecione o ERP</option>{CATALOG_ERPS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{errors.erpId ? <span className="mt-1 block text-xs text-rose-600">{errors.erpId}</span> : null}</label>
        {erp?.sourceUnitLabel ? <label className={labelClass}>{erp.sourceUnitLabel}<input value={form.sourceUnitId} onChange={(event) => change('sourceUnitId', event.target.value)} className={fieldClass} type="number" min={1} step={1} aria-invalid={Boolean(errors.sourceUnitId)} />{errors.sourceUnitId ? <span className="mt-1 block text-xs text-rose-600">{errors.sourceUnitId}</span> : null}</label> : null}
        {erp?.databaseDriver ? <div className="sm:col-span-2"><label className={labelClass}>Conexão {erp.databaseName}<div className="mt-2 flex items-start gap-2"><div className="relative min-w-0 flex-1"><input value={form.credentialRef} onChange={(event) => change('credentialRef', event.target.value)} className={`${fieldClass} mt-0 pr-12 font-mono text-xs`} type={showSecret ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} placeholder={erp.databaseDriver === 'mysql' ? 'mysql://usuario:senha@host:3306/database' : 'postgresql://usuario:senha@host:5432/database'} aria-invalid={Boolean(errors.credentialRef)} /><button type="button" onClick={() => setShowSecret((value) => !value)} className="absolute right-1.5 top-1/2 mt-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={showSecret ? 'Ocultar conexão' : 'Mostrar conexão'}>{showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><button type="button" onClick={() => void validateConnection()} disabled={connectionCheck.state === 'validating' || !form.credentialRef.trim() || !isValidCnpj(form.cnpj) || !Number.isSafeInteger(sourceUnitId) || sourceUnitId <= 0} className={`${secondaryButtonClass} mt-2 shrink-0`}>{connectionCheck.state === 'validating' ? <Loader2 className="size-4 animate-spin" /> : connectionCheck.state === 'valid' ? <CheckCircle2 className="size-4 text-emerald-600" /> : null}Validar conexão</button></div></label><p className="-mt-3 text-xs leading-5 text-slate-500 sm:col-span-2">{erp.id === 3 ? 'O teste também confirma que o shop_id pertence ao CNPJ informado.' : 'A conexão PostgreSQL será testada antes de salvar.'}{connectionCheck.message ? <span className={`mt-1 block font-medium ${connectionCheck.state === 'valid' ? 'text-emerald-700' : 'text-rose-600'}`}>{connectionCheck.message}</span> : null}{errors.credentialRef ? <span className="mt-1 block text-rose-600">{errors.credentialRef}</span> : null}</p></div> : null}
        {erp?.id === 4 ? <label className={`${labelClass} sm:col-span-2`}>API key do Vetor<div className="relative"><input value={form.vetorApiKey} onChange={(event) => change('vetorApiKey', event.target.value)} className={`${fieldClass} pr-12 font-mono text-xs`} type={showSecret ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" maxLength={2048} spellCheck={false} placeholder="Informe a API key do Vetor" aria-invalid={Boolean(errors.vetorApiKey)} /><button type="button" onClick={() => setShowSecret((value) => !value)} className="absolute right-1.5 top-1/2 mt-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={showSecret ? 'Ocultar API key' : 'Mostrar API key'}>{showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{errors.vetorApiKey ? <span className="mt-1 block text-xs text-rose-600">{errors.vetorApiKey}</span> : null}</label> : null}
        {erp?.id === 2 ? <div className="flex gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 text-xs leading-5 text-violet-900 sm:col-span-2"><Info className="mt-0.5 size-4 shrink-0" /><p>O Hub identifica a origem Linx pelo CNPJ da filial. Não é necessária conexão nem credencial adicional.</p></div> : null}
        {deployment.flowMode === 'full' ? <label className={`${labelClass} sm:col-span-2`}>Webhook de pedidos<input value={form.orderWebhookUrl} onChange={(event) => change('orderWebhookUrl', event.target.value)} className={fieldClass} type="url" inputMode="url" maxLength={2048} autoComplete="url" placeholder="https://api.exemplo.com/webhooks/pedidos" aria-invalid={Boolean(errors.orderWebhookUrl)} />{errors.orderWebhookUrl ? <span className="mt-1 block text-xs text-rose-600">{errors.orderWebhookUrl}</span> : null}</label> : null}
        {erp ? <><label className={labelClass}>Itens por página<input value={form.pageSize} onChange={(event) => change('pageSize', event.target.value)} className={fieldClass} type="number" min={1} max={500} disabled={erp.id === 2} aria-invalid={Boolean(errors.pageSize)} />{errors.pageSize ? <span className="mt-1 block text-xs text-rose-600">{errors.pageSize}</span> : null}</label><label className={labelClass}>Limite de queda de EAN (bps)<input value={form.validEanDropThresholdBps} onChange={(event) => change('validEanDropThresholdBps', event.target.value)} className={fieldClass} type="number" min={0} max={10000} disabled={erp.id === 2} aria-invalid={Boolean(errors.validEanDropThresholdBps)} />{errors.validEanDropThresholdBps ? <span className="mt-1 block text-xs text-rose-600">{errors.validEanDropThresholdBps}</span> : null}</label></> : null}
        {submitError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:col-span-2">{submitError}</p> : null}
      </div>
      <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-[#dbe3ef] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-xs leading-5 text-slate-500">A filial será cadastrada no mesmo seller e a carga será enfileirada após salvar.</p><div className="flex flex-col-reverse gap-3 sm:flex-row"><button type="button" onClick={onClose} disabled={submitting} className={secondaryButtonClass}>Cancelar</button><button type="submit" disabled={submitting} className={primaryButtonClass}>{submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{submitting ? 'Adicionando…' : 'Adicionar filial'}</button></div></div>
    </form>
  </div>;
}
