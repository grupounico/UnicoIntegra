import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  AlertTriangle,
  Activity,
  Bot,
  Brain,
  CheckCircle,
  Cpu,
  Sparkles,
} from 'lucide-react';

import { CatalogCard } from '../../components/catalog/CatalogCard';
import { CatalogPageShell } from '../../components/catalog/CatalogPageShell';
import { ModalFrame } from '../../components/ModalFrame';
import { TemplateForm } from '../../components/TemplateForm';
import { templates } from '../../data/templates_ia';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useRequireAuth } from '../../hooks/useAuthRedirect';
import { requireAuthSession } from '../../utils/authSession';
import { extractErrorMessage } from '../../utils/error';

const IAs = templates;

export default function AiPage() {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [processStatus, setProcessStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [manualAuthRequired, setManualAuthRequired] = useState(false);
  const [manualAuthMessage, setManualAuthMessage] = useState('');
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const navigate = useNavigate();

  useRequireAuth();
  useBodyScrollLock(openModal);

  const filteredIAs = useMemo(() => {
    return Object.entries(IAs).filter(
      ([, template]) =>
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (template.description &&
          template.description.toLowerCase().includes(searchTerm.toLowerCase())),
    );
  }, [searchTerm]);

  const template = selectedTemplate
    ? templates[selectedTemplate as keyof typeof templates]
    : null;

  const uiTemplate = useMemo(() => {
    if (!template) {
      return null;
    }

    if (selectedTemplate !== 'alpha7') {
      return template;
    }

    const blockedDbKeys = new Set([
      'dbname',
      'db_name',
      'database',
      'banco',
      'nome_banco',
    ]);

    return {
      ...template,
      fields: (template.fields || []).filter(
        (field: { key?: string }) =>
          !blockedDbKeys.has((field?.key || '').toLowerCase()),
      ),
    };
  }, [template, selectedTemplate]);

  function handleOpenModal(key: string) {
    const selectedIA = IAs[key as keyof typeof IAs];
    const nextFormData: Record<string, string> = {
      name: selectedIA?.name || 'IA - Unico',
    };

    if (key === 'alpha7' || key === 'vtex') {
      nextFormData.quantidade_de_produtos = '3';
    }

    if (selectedIA?.contextMode !== 'hidden') {
      nextFormData.context = selectedIA?.context || '';
    }

    setSelectedTemplate(key);
    setFormData(nextFormData);
    setProcessStatus('idle');
    setErrorMessage('');
    setManualAuthRequired(false);
    setManualAuthMessage('');
    setOpenModal(true);
  }

  function handleCloseModal() {
    setOpenModal(false);
    window.setTimeout(() => {
      setSelectedTemplate('');
      setFormData({});
      setProcessStatus('idle');
      setErrorMessage('');
      setManualAuthRequired(false);
      setManualAuthMessage('');
    }, 200);
  }

  function normalizeInstanceUrl(url?: string) {
    if (!url) {
      return '';
    }

    return url.trim().replace(/\/+$/, '');
  }

  const handleEnterPress = () => {
    if (processStatus !== 'idle') {
      return;
    }

    submitButtonRef.current?.click();
  };

  const handleCreateIa = async () => {
    if (processStatus === 'loading') {
      return;
    }

    setProcessStatus('loading');
    setErrorMessage('');

    try {
      const baseUrl = import.meta.env.VITE_URLBASE || 'https://unicocontato.tech';
      const apiUrl = `${baseUrl}/api/ia/create-ai${template?.endpoint || ''}`;
      const session = requireAuthSession();
      const apiBody: Record<string, unknown> = {
        ...formData,
        instance: normalizeInstanceUrl(formData.instance),
        name: formData.name,
        requestedBy: session.authUsername || 'Sistema',
        code: formData.code || undefined,
      };

      if (template?.contextMode !== 'hidden') {
        apiBody.context = formData.context;
      }

      if (selectedTemplate === 'alpha7') {
        delete apiBody.dbName;
        delete apiBody.db_name;
        delete apiBody.database;
        delete apiBody.Banco;
        delete apiBody.context;
      }

      await axios.post(apiUrl, apiBody);
      setProcessStatus('success');
      setManualAuthRequired(false);
      setManualAuthMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage(extractErrorMessage(error, 'Erro desconhecido ao criar IA.'));
      setManualAuthRequired(true);
      setManualAuthMessage(
        'Houve um erro ao realizar a instalação automática. Informe o código de autenticação do seu usuário para tentar novamente.',
      );
      setProcessStatus('idle');
    }
  };

  return (
    <CatalogPageShell
      title="Agentes de IA"
      description="Crie e gerencie inteligências artificiais para automatizar seu atendimento."
      icon={Brain}
      iconClassName="text-primary"
      searchTerm={searchTerm}
      onSearchTermChange={(event) => setSearchTerm(event.target.value)}
      searchPlaceholder="Buscar modelos de IA..."
      headerActions={
        <div className="flex max-w-sm flex-wrap gap-2">
          <button
            onClick={() => navigate('/main/iaPage/resultados')}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Activity className="h-4 w-4" />
            Resultados em operação
          </button>
          <button
            onClick={() => navigate('/main/iaPage/templates')}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <Sparkles className="h-4 w-4" />
            Gerenciar templates
          </button>
          <button
            onClick={() => navigate('/main/iaPage/list')}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Brain className="h-4 w-4" />
            Ver IAs instaladas
          </button>
        </div>
      }
      isEmpty={filteredIAs.length === 0}
      emptyIcon={Bot}
      emptyTitle="Nenhum modelo encontrado"
      emptyDescription="Tente ajustar sua busca."
      theme="slate"
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredIAs.map(([key, item]) => (
          <CatalogCard
            key={key}
            theme="slate"
            selected={selectedTemplate === key}
            onClick={() => handleOpenModal(key)}
            media={
              <div className="relative h-44 w-full overflow-hidden border-b border-gray-100 bg-gray-100">
                {item.banner ? (
                  <div
                    className="h-full w-full bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${item.banner})` }}
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-gray-300">
                    <Bot className="mb-2 h-16 w-16 text-violet-200" />
                  </div>
                )}
              </div>
            }
            badge={
              <div className="flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-bold text-violet-700 shadow-sm backdrop-blur-md">
                <Sparkles className="h-3 w-3" />
                {'type' in item && item.type === 'assistente' ? 'AI Assistant' : 'AI Model'}
              </div>
            }
          >
            <h3 className="mb-1 text-lg font-bold text-slate-900 transition-colors group-hover:text-violet-600">
              {item.name}
            </h3>
            <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-slate-500">
              {item.description || 'Modelo de inteligência artificial avançado.'}
            </p>
            <div className="mt-auto flex items-center justify-between border-t border-gray-50 pt-4">
              <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Cpu className="h-3 w-3" /> V {item.version || '1.0'}
              </span>
              <button className="text-sm font-medium text-violet-600 group-hover:underline">
                Configurar &rarr;
              </button>
            </div>
          </CatalogCard>
        ))}
      </div>

      {uiTemplate && openModal ? (
        <ModalFrame
          title={
            processStatus === 'idle'
              ? `Configurar ${uiTemplate.name}`
              : 'Status da Instalação'
          }
          onClose={handleCloseModal}
          maxWidthClassName={
            uiTemplate.contextMode === 'hidden' ? 'max-w-3xl' : 'max-w-5xl'
          }
          bodyClassName="overflow-y-auto custom-scrollbar px-6 py-3"
        >
          {processStatus === 'idle' ? (
            <div className="space-y-6 pb-6">
              <div className="flex gap-3 rounded-lg border border-violet-100 bg-violet-50 p-3">
                <Bot className="mt-0.5 h-6 w-6 shrink-0 text-violet-600" />
                <div className="text-sm text-violet-900">
                  <p className="font-semibold">Defina o comportamento</p>
                  <p className="opacity-80">
                    Preencha os campos abaixo para configurar o agente.
                  </p>
                </div>
              </div>

              <TemplateForm
                template={uiTemplate}
                formData={formData}
                setFormData={setFormData}
                isIaSetup={true}
                showManualAuthFields={manualAuthRequired}
                manualAuthMessage={manualAuthMessage}
                onPressEnter={handleEnterPress}
              />

              {errorMessage ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <div className="border-t border-gray-100 pt-4">
                <button
                  ref={submitButtonRef}
                  onClick={handleCreateIa}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 font-semibold text-white shadow-lg shadow-violet-200 transition-all hover:-translate-y-0.5 hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Sparkles className="h-5 w-5" />
                  Instalar e Criar IA
                </button>
              </div>
            </div>
          ) : null}

          {processStatus === 'loading' ? (
            <div className="flex flex-col items-center py-12 text-center animate-in fade-in">
              <div className="relative mb-6 h-24 w-24">
                <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Brain className="h-10 w-10 animate-pulse text-violet-500" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-800">Criando Agente...</h3>
              <p className="mt-2 max-w-xs text-slate-500">
                Estamos configurando a IA, aguarde alguns segundos.
              </p>
            </div>
          ) : null}

          {processStatus === 'success' ? (
            <div className="flex flex-col items-center py-8 text-center animate-in zoom-in duration-300">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-50 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Sucesso!</h3>
              <p className="mt-2 mb-8 max-w-sm text-slate-600">
                Sua IA <strong>{formData.name}</strong> foi criada e já está pronta.
              </p>
              <button
                onClick={handleCloseModal}
                className="w-full max-w-xs rounded-xl bg-gray-900 py-3 font-semibold text-white shadow-lg transition-all hover:bg-gray-800"
              >
                Fechar
              </button>
            </div>
          ) : null}

          {processStatus === 'error' ? (
            <div className="flex flex-col items-center py-8 text-center animate-in shake duration-300">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-red-100 bg-red-50">
                <AlertTriangle className="h-10 w-10 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Falha na Criação</h3>
              <div className="mt-4 w-full max-w-md break-words rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                {errorMessage}
              </div>
              <div className="mt-8 flex w-full max-w-xs gap-3">
                <button
                  onClick={handleCloseModal}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setProcessStatus('idle')}
                  className="flex-1 rounded-xl bg-violet-600 py-3 font-semibold text-white shadow-lg shadow-violet-200 transition-colors hover:bg-violet-700"
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          ) : null}
        </ModalFrame>
      ) : null}
    </CatalogPageShell>
  );
}
