import { api } from "./api";
import { requireAuthSession } from "../utils/authSession";
import { isAxiosError } from "axios";

// Definindo a tipagem da resposta paginada
export interface DatabaseItem {
    name: string;
    size: string;
}

export type DatabaseDriver = 'postgres' | 'mysql';

export interface DatabaseConnectionOptions {
    driver?: DatabaseDriver;
    sourceUnitId?: number;
}

export interface DatabaseConnectionPayload extends DatabaseConnectionOptions {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    cnpj?: string;
}

export interface DatabaseBusinessUnitLookup {
    requestedCnpj: string;
    found: boolean;
    message: string;
    unit: {
        id: number;
        status: string | null;
        codigo: string | null;
        nome: string | null;
        cnpj: string | null;
        nomeFantasia: string | null;
        razaoSocial: string | null;
    } | null;
}

export interface DatabaseConnectionResult {
    success: boolean;
    message: string;
    latencyMs: number;
    details: {
        driver?: DatabaseDriver;
        host: string;
        port: number;
        database: string;
        user: string;
        ssl: boolean;
        sslAutoEnabled?: boolean;
    };
    businessUnitLookup: DatabaseBusinessUnitLookup | null;
}

export interface DatabaseIntegrationStatusResult {
    success: boolean;
    message: string;
    latencyMs: number;
    database: string;
    requirements: {
        schema: string;
        table: string;
        tableExists: boolean;
        hasProducts: boolean;
        productCount: number;
        productCountSource: 'exact' | 'estimated';
        hasReadAccess: boolean;
    };
    readyForIntegration: boolean;
}

export interface PaginatedResponse {
    data: DatabaseItem[];
    meta: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
    }
}

export async function getDatabases(page = 1, limit = 9, search = '') {
    // Enviamos como params na URL
    const response = await api.get<PaginatedResponse>('api/databases', {
        params: {
            page,
            limit,
            search
        }/* , headers:{
            'x-api-key': import.meta.env.VITE_ADMIN_API_KEY,
        } */
    });
    return response.data;
}

export async function createDatabase(name: string) {

    const username = requireAuthSession().authUsername
    const response = await api.post(
        'api/databases/createDatabase', // URL completa conforme sua rota
        { name,  username}, // Body do POST
        {
            /* headers: {
                'x-api-key': import.meta.env.VITE_ADMIN_API_KEY,
            } */
        }
    );
    return response.data;
}

export async function testDatabaseConnection(payload: DatabaseConnectionPayload) {
    const username = requireAuthSession().authUsername
    const response = await api.post<DatabaseConnectionResult>(
        'api/databases/testConnection',
        {
            ...payload,
            username,
        }
    );
    return response.data;
}

export function databaseConnectionPayloadFromUrl(connectionUrl: string, cnpj?: string, options: DatabaseConnectionOptions = {}): DatabaseConnectionPayload {
    const driver = options.driver ?? 'postgres';
    const databaseName = driver === 'mysql' ? 'MySQL' : 'PostgreSQL';
    let parsed: URL;
    let database: string;
    let user: string;
    let password: string;
    try {
        parsed = new URL(connectionUrl.trim());
        database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
        user = decodeURIComponent(parsed.username);
        password = decodeURIComponent(parsed.password);
    } catch {
        throw new Error(`Use uma URL ${databaseName} completa, incluindo usuário e senha.`);
    }
    const protocols = driver === 'mysql' ? ['mysql:'] : ['postgres:', 'postgresql:'];
    if (!protocols.includes(parsed.protocol) || !parsed.hostname || !database || !user || !password || parsed.hash) {
        throw new Error(`Use uma URL ${databaseName} completa, incluindo usuário e senha.`);
    }
    const port = parsed.port ? Number(parsed.port) : driver === 'mysql' ? 3306 : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`A porta informada na URL ${databaseName} é inválida.`);
    }
    if ((driver === 'mysql' || options.sourceUnitId !== undefined)
        && (!Number.isSafeInteger(options.sourceUnitId) || Number(options.sourceUnitId) <= 0)) {
        throw new Error('Informe um ID de unidade inteiro positivo para validar a conexão.');
    }
    const sslOption = parsed.searchParams.get('ssl');
    if (driver === 'mysql' && ((sslOption !== null && !['true', 'false'].includes(sslOption)) || parsed.searchParams.has('sslmode'))) {
        throw new Error('Na URL MySQL, use somente ssl=true ou ssl=false para configurar TLS.');
    }
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    const ssl = sslOption === 'true'
        || (driver === 'postgres' && ['require', 'verify-ca', 'verify-full'].includes(sslMode || ''));
    return {
        driver,
        host: parsed.hostname,
        port,
        database,
        user,
        password,
        ssl,
        ...(cnpj ? { cnpj: cnpj.replace(/\D/g, '') } : {}),
        ...(options.sourceUnitId !== undefined ? { sourceUnitId: options.sourceUnitId } : {}),
    };
}

export async function testDatabaseConnectionUrl(connectionUrl: string, cnpj?: string, options: DatabaseConnectionOptions = {}) {
    return testDatabaseConnection(databaseConnectionPayloadFromUrl(connectionUrl, cnpj, options));
}

export function databaseConnectionErrorMessage(error: unknown) {
    if (isAxiosError<{ error?: string; message?: string }>(error)) {
        return error.response?.data?.error || error.response?.data?.message || error.message;
    }
    return error instanceof Error ? error.message : 'Não foi possível validar a conexão.';
}

export async function checkIntegrationDatabaseStatus(database: string) {
    const username = requireAuthSession().authUsername
    const response = await api.post<DatabaseIntegrationStatusResult>(
        'api/databases/checkIntegrationStatus',
        {
            database,
            username,
        }
    );
    return response.data;
}
