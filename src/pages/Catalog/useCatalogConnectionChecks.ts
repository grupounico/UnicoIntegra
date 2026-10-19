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

  const validateConnection = useCallback(async (unitId: string, input: CatalogConnectionInput) => {
    const requestId = Symbol();
    const fingerprint = catalogConnectionFingerprint(input);
    requests.current.set(unitId, requestId);
    setChecks((current) => ({ ...current, [unitId]: { state: 'validating', fingerprint } }));
    try {
      const result = await testDatabaseConnectionUrl(input.credentialRef, input.cnpj, {
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
      if (requests.current.get(unitId) !== requestId) return;
      setChecks((current) => ({ ...current, [unitId]: { state: 'valid', fingerprint, message: `${result.message} (${result.latencyMs} ms)` } }));
    } catch (caught) {
      if (requests.current.get(unitId) !== requestId) return;
      setChecks((current) => ({ ...current, [unitId]: { state: 'error', fingerprint, message: databaseConnectionErrorMessage(caught) } }));
    }
  }, []);

  return { checks, invalidate, validateConnection };
}
