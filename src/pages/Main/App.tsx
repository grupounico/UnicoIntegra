import { Navigate, Route, Routes } from 'react-router-dom';
import './App.scss';
import Header from '../../components/Header/Header';
import { GlobalStatusPopup } from '../../components/GlobalStatusPopup';
import { GenerationProvider } from '../../context/GenerationContext';
import ApplicationsHub from '../Aplications/ApplicationsHub';
import AiServicesManager from '../Aplications/AiServicesManager';
import InovaFarmaExtensionGenerator from '../Aplications/InovaFarmaExtensionGenerator';
import { PkgGenerator } from '../Aplications/PkgGenerator';
import TrierExtensionGenerator from '../Aplications/TrierExtensionGenerator';
import Automations from '../Automations/Automations';
import Databases from '../Databases/Databases';
import DocsRouter from '../Docs/DocsRouter';
import ExtensionManager from '../ExtensionManager/ExtensionManager';
import Home from '../Home/Home';
import AiPage from '../AiPage/AiPage';
import AiTemplateManagerPage from '../AiPage/AiTemplateManagerPage';
import AiVersionsPage from '../AiPage/AiVersionsPage';
import Integrations from '../Integrations/Integrations';
import LinkAi from '../LinkAi/LinkAi';
import Logs from '../SystemLogs/Logs';
import { getAuthSession } from '../../utils/authSession';
import Clientes from '../Clientes/Clientes';
import ClienteDetalhes from '../Clientes/ClienteDetalhes';
import CatalogDeploymentsPage from '../Catalog/CatalogDeploymentsPage';
import NewCatalogDeploymentPage from '../Catalog/NewCatalogDeploymentPage';
import CatalogDeploymentDetailsPage from '../Catalog/CatalogDeploymentDetailsPage';
import CatalogActivationReviewPage from '../Catalog/CatalogActivationReviewPage';
import { CATALOG_DEMO_MODE } from '../../services/catalogDeployment.service';

export default function App() {
  const session = getAuthSession();
  const isCatalogDemo = CATALOG_DEMO_MODE && window.location.pathname.startsWith('/main/catalogo');

  if (!session && !isCatalogDemo) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="main flex-row">
      <Header />

      <section className="relative max-h-screen w-full overflow-y-hidden">
        <GenerationProvider>
          <Routes>
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="link-ai" element={<LinkAi />} />
            <Route path="aplications" element={<ApplicationsHub />} />
            <Route path="aplications/pkg-generator" element={<PkgGenerator />} />
            <Route
              path="aplications/trier-extension"
              element={<TrierExtensionGenerator />}
            />
            <Route
              path="aplications/inova-farma-extension"
              element={<InovaFarmaExtensionGenerator />}
            />
            <Route
              path="aplications/ia-services"
              element={<AiServicesManager />}
            />
            <Route path="integrations" element={<Integrations />} />
            <Route path="automations" element={<Automations />} />
            <Route path="iaPage" element={<AiPage />} />
            <Route path="iaPage/list" element={<AiVersionsPage />} />
            <Route path="iaPage/templates" element={<AiTemplateManagerPage />} />
            <Route path="extensions" element={<ExtensionManager />} />
            <Route path="databases" element={<Databases />} />
            <Route path="docs/*" element={<DocsRouter />} />
            <Route path="logs" element={<Logs />} />
            <Route path="clientes/:id" element={<ClienteDetalhes />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="catalogo" element={<CatalogDeploymentsPage />} />
            <Route path="catalogo/novo" element={<NewCatalogDeploymentPage />} />
            <Route path="catalogo/:deploymentId/revisao" element={<CatalogActivationReviewPage />} />
            <Route path="catalogo/:deploymentId" element={<CatalogDeploymentDetailsPage />} />
            <Route path="*" element={<Navigate to="home" replace />} />
          </Routes>

          <GlobalStatusPopup />
        </GenerationProvider>
      </section>
    </main>
  );
}
