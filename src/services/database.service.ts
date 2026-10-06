import { api } from "./api";
import { requireAuthSession } from "../utils/authSession";
import { isAxiosError } from "axios";

// Definindo a tipagem da resposta paginada
export interface DatabaseItem {
    name: string;
    size: string;
}

export interface DatabaseConnectionPayload {
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
        host: string;
        port: number;
        database: string;
        user: string;
        ssl: boolean;
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

export function databaseConnectionPayloadFromUrl(connectionUrl: string, cnpj?: string): DatabaseConnectionPayload {
    const parsed = new URL(connectionUrl.trim());
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !database || !user || !password) {
        throw new Error('Use uma URL PostgreSQL completa, incluindo usuário e senha.');
    }
    const port = parsed.port ? Number(parsed.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('A porta informada na URL PostgreSQL é inválida.');
    }
    const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
    const ssl = parsed.searchParams.get('ssl') === 'true'
        || ['require', 'verify-ca', 'verify-full'].includes(sslMode || '');
    return {
        host: parsed.hostname,
        port,
        database,
        user,
        password,
        ssl,
        ...(cnpj ? { cnpj: cnpj.replace(/\D/g, '') } : {}),
    };
}

export async function testDatabaseConnectionUrl(connectionUrl: string, cnpj?: string) {
    return testDatabaseConnection(databaseConnectionPayloadFromUrl(connectionUrl, cnpj));
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
