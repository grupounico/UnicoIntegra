import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { fieldClass } from './catalogUi';

export type DatabaseDriver = 'postgres' | 'mysql';
const SCHEME: Record<DatabaseDriver, string> = { postgres: 'postgresql', mysql: 'mysql' };
type TextKey = 'host' | 'port' | 'database' | 'user' | 'password';
type Parts = Record<TextKey, string> & { ssl: boolean };

const DEFAULT_PORT: Record<DatabaseDriver, string> = { postgres: '5432', mysql: '3306' };
const HOST_PATTERN = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)$/;

const sanitize: Record<TextKey, (value: string) => string> = {
  host: (value) => value.trim().replace(/^[a-z]+:\/\//i, '').replace(/[/?#@].*$/, '').toLowerCase().replace(/[^a-z0-9.-]/g, ''),
  port: (value) => value.replace(/\D/g, '').slice(0, 5),
  database: (value) => value.replace(/[^A-Za-z0-9_.$-]/g, ''),
  user: (value) => value.replace(/\s/g, ''),
  password: (value) => value,
};

function decode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

// Parsed by hand (split on the last "@") so pasted URLs with unencoded passwords like "s3nh@#a" still work.
function parse(value: string, driver: DatabaseDriver): Parts | null {
  const match = /^([a-z]+):\/\/(.*)$/i.exec(value.trim());
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  if (driver === 'mysql' ? scheme !== 'mysql' : !['postgresql', 'postgres'].includes(scheme)) return null;
  const rest = match[2];
  const at = rest.lastIndexOf('@');
  if (at < 0) return null;
  const credentials = rest.slice(0, at);
  const location = /^\[?([^\]/:?]+)\]?(?::(\d+))?\/([^?]*)(?:\?(.*))?$/.exec(rest.slice(at + 1));
  if (!location) return null;
  const query = new URLSearchParams(location[4] || '');
  const colon = credentials.indexOf(':');
  return {
    host: location[1].toLowerCase(), port: location[2] || DEFAULT_PORT[driver], database: decode(location[3]),
    user: decode(colon < 0 ? credentials : credentials.slice(0, colon)), password: decode(colon < 0 ? '' : credentials.slice(colon + 1)),
    ssl: query.get('ssl') === 'true' || ['require', 'verify-ca', 'verify-full'].includes((query.get('sslmode') || '').toLowerCase()),
  };
}

// Builds the same connection string the API already validates, with credentials percent-encoded.
function compose(parts: Parts, driver: DatabaseDriver) {
  if (!parts.host || !parts.database || !parts.user || !parts.password || !HOST_PATTERN.test(parts.host)) return '';
  const port = parts.port || DEFAULT_PORT[driver];
  const ssl = parts.ssl ? (driver === 'mysql' ? '?ssl=true' : '?sslmode=require') : '';
  return `${SCHEME[driver]}://${encodeURIComponent(parts.user)}:${encodeURIComponent(parts.password)}@${parts.host}:${port}/${encodeURIComponent(parts.database)}${ssl}`;
}

function empty(driver: DatabaseDriver): Parts { return { host: '', port: DEFAULT_PORT[driver], database: '', user: '', password: '', ssl: false }; }

export default function DatabaseConnectionFields({ driver, value, onChange, disabled, invalid, keepHint }: { driver: DatabaseDriver; value: string; onChange: (connection: string) => void; disabled?: boolean; invalid?: boolean; keepHint?: boolean }) {
  const id = useId();
  const [parts, setParts] = useState<Parts>(() => parse(value, driver) || empty(driver));
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<TextKey, boolean>>>({});
  const lastEmitted = useRef(value);

  // The parent may clear the connection (after saving or switching ERP); mirror that here.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setParts(parse(value, driver) || empty(driver));
    setTouched({});
  }, [value, driver]);

  function update(next: Parts) {
    setParts(next);
    const connection = compose(next, driver);
    lastEmitted.current = connection;
    onChange(connection);
  }
  function change(key: TextKey, raw: string) {
    // Pasting a full URL into the host field fills every field at once.
    if (key === 'host' && /^[a-z]+:\/\//i.test(raw.trim())) {
      const parsed = parse(raw, driver);
      if (parsed) { update(parsed); return; }
    }
    // SSL is detected per server during validation, so a new host starts without it again.
    update({ ...parts, [key]: sanitize[key](raw), ...(key === 'host' ? { ssl: false } : {}) });
  }

  const portNumber = Number(parts.port);
  const errors: Record<TextKey, string> = {
    host: !parts.host ? 'Informe o host.' : !HOST_PATTERN.test(parts.host) ? 'Use um nome de host ou IP válido, sem protocolo ou caminho.' : '',
    port: !parts.port ? '' : !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535 ? 'Porta entre 1 e 65535.' : '',
    database: !parts.database ? 'Informe o nome do banco.' : '',
    user: !parts.user ? 'Informe o usuário.' : '',
    password: !parts.password ? 'Informe a senha.' : '',
  };
  const started = Boolean(parts.host || parts.database || parts.user || parts.password);
  const show = (key: TextKey) => (touched[key] || invalid) && started && errors[key];
  const errorText = (key: TextKey) => show(key) ? <span id={`${id}-${key}-error`} className="mt-1 block text-xs font-normal text-rose-600">{errors[key]}</span> : null;
  const inputClass = (key: TextKey) => `${fieldClass} mt-1.5 font-mono text-[13px] ${show(key) ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100' : ''}`;
  const shared = (key: TextKey) => ({ id: `${id}-${key}`, value: parts[key], disabled, spellCheck: false, onChange: (event: React.ChangeEvent<HTMLInputElement>) => change(key, event.target.value), onBlur: () => setTouched(current => ({ ...current, [key]: true })), 'aria-invalid': Boolean(show(key)), 'aria-describedby': show(key) ? `${id}-${key}-error` : undefined });
  const input = (key: TextKey, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => <label className="block text-xs font-medium text-slate-700" htmlFor={`${id}-${key}`}>
    {label}
    <input {...shared(key)} autoCapitalize="none" autoCorrect="off" className={inputClass(key)} {...props} />
    {errorText(key)}
  </label>;

  const preview = compose({ ...parts, password: parts.password ? 'x' : '' }, driver).replace(/:x@/, ':••••••@');
  return <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7.5rem]">
      {input('host', 'Host', { placeholder: keepHint ? 'Manter conexão atual' : 'Ex.: 10.0.0.12 ou db.empresa.com.br', autoComplete: 'off', inputMode: 'url', maxLength: 253 })}
      {input('port', 'Porta', { inputMode: 'numeric', autoComplete: 'off', placeholder: DEFAULT_PORT[driver] })}
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {input('database', 'Banco de dados', { autoComplete: 'off', maxLength: 128 })}
      {input('user', 'Usuário', { autoComplete: 'off', maxLength: 128 })}
    </div>
    <label className="mt-4 block text-xs font-medium text-slate-700" htmlFor={`${id}-password`}>
      Senha
      <span className="relative mt-1.5 block">
        <input {...shared('password')} type={showPassword ? 'text' : 'password'} autoComplete="new-password" maxLength={512} className={`${inputClass('password')} mt-0 pr-12`} />
        <button type="button" onClick={() => setShowPassword(current => !current)} disabled={disabled} className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
      </span>
      {errorText('password')}
    </label>
    {parts.ssl ? <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"><ShieldCheck aria-hidden="true" className="size-3.5" />Conexão segura (SSL) ativa</p> : null}
    <p className="mt-3 text-xs leading-5 text-slate-500">
      {preview ? <>Conexão: <code className="break-all rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-inset ring-slate-200">{preview}</code></> : keepHint ? 'Deixe os campos em branco para manter a conexão atual.' : 'Dica: cole uma URL de conexão completa no campo Host para preencher tudo de uma vez. Se o servidor exigir conexão segura (SSL), ela é ativada na validação.'}
    </p>
  </div>;
}
