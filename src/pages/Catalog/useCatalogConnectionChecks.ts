import { useCallback, useEffect, useRef, useState } from 'react';
import { databaseConnectionErrorMessage, testDatabaseConnectionUrl, type DatabaseDriver } from '../../services/database.service';

export type CatalogConnectionInput = {
  driver: DatabaseDriver;
  credentialRef: string;
  cnpj: string;
  sourceUnitId: number | null;
};

export type CatalogConnectionCheck = {
  state: 'idle' | 'validating' | 'valid' | 'error';
  fingerprint?: string;
  message?: string;
};

export function catalogConnectionFingerprint(input: CatalogConnectionInput) {
  return JSON.stringify([input.driver, input.credentialRef.trim(), input.cnpj.replace(/\D/g, ''), input.sourceUnitId]);
}

export function hasValidCatalogConnection(check: CatalogConnectionCheck | undefined, input: CatalogConnectionInput) {
  return check?.state === 'valid' && check.fingerprint === catalogConnectionFingerprint(input);
}

function hasSslOption(url: string) {
  return /[?&](sslmode|ssl)=/i.test(url);
}

function withSsl(url: string, driver: DatabaseDriver) {
  return `${url}${url.includes('?') ? '&' : '?'}${driver === 'mysql' ? 'ssl=true' : 'sslmode=require'}`;
}

export function useCatalogConnectionChecks() {
  const [checks, setChecks] = useState<Record<string, CatalogConnectionCheck>>({});
  const requests = useRef(new Map<string, symbol>());

  useEffect(() => {
    const activeRequests = requests.current;
    return () => activeRequests.clear();
  }, []);

  const invalidate = useCallback((unitId: string) => {
    requests.current.delete(unitId);
    setChecks((current) => {
      const next = { ...current };
      delete next[unitId];
      return next;
    });
  }, []);

  // applyConnection receives the SSL version of the URL when the server turns out to require it,
  // so the screen saves the connection that was actually validated.
  const validateConnection = useCallback(async (unitId: string, input: CatalogConnectionInput, applyConnection?: (connection: string) => void) => {
    const requestId = Symbol();
    requests.current.set(unitId, requestId);
    setChecks((current) => ({ ...current, [unitId]: { state: 'validating', fingerprint: catalogConnectionFingerprint(input) } }));
    const attempt = async (credentialRef: string) => {
      const result = await testDatabaseConnectionUrl(credentialRef, input.cnpj, {
        driver: input.driver,
        ...(input.sourceUnitId !== null ? { sourceUnitId: input.sourceUnitId } : {}),
      });
      if (!result.success) throw new Error(result.message || 'Não foi possível validar a conexão.');
      if (input.driver === 'mysql') {
        const lookup = result.businessUnitLookup;
        if (result.details?.driver !== 'mysql' || !lookup?.found || lookup.unit?.id !== input.sourceUnitId
          || lookup.unit.cnpj?.replace(/\D/g, '') !== input.cnpj.replace(/\D/g, '')) {
          throw new Error('O teste MySQL precisa confirmar que o ID da loja corresponde ao CNPJ informado.');
        }
      }
      return result;
    };
    try {
      const result = await attempt(input.credentialRef);
      // The API retries once with SSL when the server demands it; keep that encrypted connection.
      const upgraded = Boolean(result.details?.sslAutoEnabled) && !hasSslOption(input.credentialRef);
      const validated = upgraded ? { ...input, credentialRef: withSsl(input.credentialRef, input.driver) } : input;
      if (requests.current.get(unitId) !== requestId) return;
      if (upgraded) applyConnection?.(validated.credentialRef);
      const message = `${result.message} (${result.latencyMs} ms)${upgraded ? ' · Conexão segura (SSL) ativada automaticamente: o servidor exige.' : ''}`;
      setChecks((current) => ({ ...current, [unitId]: { state: 'valid', fingerprint: catalogConnectionFingerprint(validated), message } }));
    } catch (caught) {
      if (requests.current.get(unitId) !== requestId) return;
      setChecks((current) => ({ ...current, [unitId]: { state: 'error', fingerprint: catalogConnectionFingerprint(input), message: databaseConnectionErrorMessage(caught) } }));
    }
  }, []);

  return { checks, invalidate, validateConnection };
}
