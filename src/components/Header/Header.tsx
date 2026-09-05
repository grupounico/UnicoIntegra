import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Book,
  Boxes,
  Bot,
  Cpu,
  Database,
  Home,
  LogOut,
  Logs,
  Plug,
  Puzzle,
  ShoppingBasket,
  Users,
} from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';
import './Header.scss';
import { clearAuthSession } from '../../utils/authSession';

export default function Header() {
  const navigate = useNavigate();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  function handleLogout() {
    setIsLogoutDialogOpen(false);
    clearAuthSession();

    navigate('/'); // Redireciona para a página de login
  }

  const location = useLocation();

  function isMenuItemActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  const primaryMenuItems = [
    { path: '/main/home', icon: Home, description: 'Início' },
    { path: '/main/databases', icon: Database, description: 'Bancos de Dados' },
    { path: '/main/link-ai', icon: Bot, description: 'Link IA' },
    { path: '/main/aplications', icon: Boxes, description: 'Serviços' },
    { path: '/main/clientes', icon: Users, description: 'Clientes' },
    { path: '/main/catalogo', icon: ShoppingBasket, description: 'Catálogo de produtos' },
  ];

  const secondaryMenuItems = [
    { path: '/main/integrations', icon: Plug, description: 'Integrações' },
    { path: '/main/extensions', icon: Puzzle, description: 'Extensões' },
    { path: '/main/iaPage', icon: Cpu, description: 'IAs' },
    { path: '/main/docs', icon: Book, description: 'Documentação' },
    { path: '/main/logs', icon: Logs, description: 'Logs do sistema' },
  ];

  function renderMenuItem({
    path,
    icon: Icon,
    description,
  }: {
    path: string;
    icon: typeof Home;
    description: string;
  }) {
    const isActive = isMenuItemActive(path);

    return (
      <Link to={path} key={path} className="group relative flex">
        <span
          className={`flex size-11 items-center justify-center rounded-full transition-colors duration-150 ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-white/50 hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          <Icon size={19} />
        </span>

        <span
          className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
        >
          {description}
        </span>
      </Link>
    );
  }

  return (
    <>
      <header className="header h-screen p-2 bg-background">
        <nav className="navbar flex h-full flex-col items-center gap-5 rounded-2xl bg-gray-950 px-3 py-5">
          <img className="w-10" src="/unico-fav.svg" alt="Unico Integra" />

          <div className="flex h-full flex-col items-center justify-between">
            <div className="flex flex-col items-center gap-5">
              <ul className="nav-list flex flex-col gap-1.5">
                {primaryMenuItems.map((item) => renderMenuItem(item))}
              </ul>

              <div className="w-8 border-t border-white/10" />

              <ul className="nav-list flex flex-col gap-1.5">
                {secondaryMenuItems.map((item) => renderMenuItem(item))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setIsLogoutDialogOpen(true)}
              className="flex size-11 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Sair da conta"
            >
              <LogOut size={19} />
            </button>
          </div>
        </nav>
      </header>

      {isLogoutDialogOpen ? (
        <ConfirmDialog
          title="Deseja realmente sair?"
          description={
            <>
              Você será desconectado da plataforma.
              <br />
              Se houver alterações não salvas, elas sero perdidas.
            </>
          }
          confirmText="Sair da conta"
          cancelText="Continuar no painel"
          tone="danger"
          onClose={() => setIsLogoutDialogOpen(false)}
          onConfirm={handleLogout}
        />
      ) : null}
    </>
  );
}
