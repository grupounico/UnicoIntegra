import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import LoadingScreen from '../../components/LoadingScreen/LoadingScreen';
import { useRedirectIfAuthenticated } from '../../hooks/useAuthRedirect';
import { hasSessionExpiredNotice, setAuthSession } from '../../utils/authSession';
import './LoginPage.scss';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionExpired] = useState(hasSessionExpiredNotice);
  const navigate = useNavigate();

  useRedirectIfAuthenticated('/main/home');

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const apiUrl =
        'https://ambientesdetesteunicocontato.atenderbem.com/login';
      const response = await axios.post(apiUrl, { username, password, code });

      setAuthSession({
        authToken: response.data.token,
        authUsername: username,
        authPassword: password,
        username: response.data.user.fullname,
      });

      navigate('/main/home');
    } catch (err) {
      console.error(err);
      setError('Usuario ou senha invalidos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="main">
      {loading ? <LoadingScreen loadingMessage="Carregando..." /> : null}

      <section className="banner-section ">
        <picture className="logo-container">
          <img
            src="/logo-branca-na-ponta_20230831_131618_0001-e1693505469301-768x231 1.svg"
            alt=""
          />
        </picture>
      </section>

      <section className="form-section ">
        <form
          onSubmit={handleLogin}
          className="login-form flex items-center flex-col"
        >
          <picture className="pb-12">
            <img src="/loginunico.svg" alt="" />
          </picture>

          <h2 className="self-start pb-4">Acesso ao Sistema</h2>

          <div className="form-group">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Digite seu usuario"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="code">Codigo 2FA</label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Digite seu codigo de 2FA"
              disabled={loading}
              required
            />
          </div>

          <button type="submit" className="button" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          {sessionExpired && !error ? <p className="error" role="status">Sua sessão expirou. Entre novamente para continuar.</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
