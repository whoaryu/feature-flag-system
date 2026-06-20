import { Pool } from 'pg';
import {
  IProjectRepository,
  IFlagRepository,
  IAdminRepository,
  IAuditLogRepository,
  IEvalLogRepository,
  IWebhookRepository
} from './interfaces';
import {
  MemoryProjectRepository,
  MemoryFlagRepository,
  MemoryAdminRepository,
  MemoryAuditLogRepository,
  MemoryEvalLogRepository,
  MemoryWebhookRepository,
  bootstrapMemoryDb
} from './memory-repo';
import {
  PostgresProjectRepository,
  PostgresFlagRepository,
  PostgresAdminRepository,
  PostgresAuditLogRepository,
  PostgresEvalLogRepository,
  PostgresWebhookRepository
} from './postgres-repo';

let projectRepo: IProjectRepository;
let flagRepo: IFlagRepository;
let adminRepo: IAdminRepository;
let auditLogRepo: IAuditLogRepository;
let evalLogRepo: IEvalLogRepository;
let webhookRepo: IWebhookRepository;
let pgPool: Pool | null = null;

export async function initializeRepositories() {
  const dbType = process.env.DB_TYPE || 'memory';

  if (dbType === 'postgres') {
    console.log('[Database] Initializing PostgreSQL repository layer...');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // fallback options
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : undefined
    });

    // Test connection
    try {
      await pgPool.query('SELECT NOW()');
      console.log('[Database] PostgreSQL connected successfully.');
    } catch (e) {
      console.error('[Database] Failed to connect to PostgreSQL. Verify credentials.', e);
      throw e;
    }

    projectRepo = new PostgresProjectRepository(pgPool);
    flagRepo = new PostgresFlagRepository(pgPool);
    adminRepo = new PostgresAdminRepository(pgPool);
    auditLogRepo = new PostgresAuditLogRepository(pgPool);
    evalLogRepo = new PostgresEvalLogRepository(pgPool);
    webhookRepo = new PostgresWebhookRepository(pgPool);
  } else {
    console.log('[Database] Initializing In-Memory repository layer...');
    await bootstrapMemoryDb();
    
    projectRepo = new MemoryProjectRepository();
    flagRepo = new MemoryFlagRepository();
    adminRepo = new MemoryAdminRepository();
    auditLogRepo = new MemoryAuditLogRepository();
    evalLogRepo = new MemoryEvalLogRepository();
    webhookRepo = new MemoryWebhookRepository();
  }
}

export function getProjectRepo() { return projectRepo; }
export function getFlagRepo() { return flagRepo; }
export function getAdminRepo() { return adminRepo; }
export function getAuditLogRepo() { return auditLogRepo; }
export function getEvalLogRepo() { return evalLogRepo; }
export function getWebhookRepo() { return webhookRepo; }
export function getPgPool() { return pgPool; }
