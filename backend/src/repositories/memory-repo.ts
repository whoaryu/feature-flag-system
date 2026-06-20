import bcrypt from 'bcryptjs';
import {
  IProjectRepository,
  IFlagRepository,
  IAdminRepository,
  IAuditLogRepository,
  IEvalLogRepository,
  IWebhookRepository
} from './interfaces';
import { Project, ProjectEnvironment, FlagDefinition, AuditLog, FlagEvaluation } from '../../../shared/types';

// In-Memory Database Stores
export const projectsDb: Record<string, Project> = {};
export const flagsDb: Record<string, FlagDefinition> = {};
export const adminsDb: Record<string, any> = {};
export const auditLogsDb: AuditLog[] = [];
export const evaluationsDb: FlagEvaluation[] = [];
export const webhooksDb: any[] = [];

// Seed Default Data
export async function bootstrapMemoryDb() {
  // 1. Create Default Admin (admin@example.com / admin123)
  const defaultAdminId = 'admin-default';
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  adminsDb[defaultAdminId] = {
    id: defaultAdminId,
    email: 'admin@example.com',
    passwordHash: hashedPassword,
    name: 'Default Admin',
    createdAt: new Date()
  };

  // 2. Create Default Project
  const defaultProjId = 'proj-default';
  const devEnv: ProjectEnvironment = {
    id: 'env-dev',
    projectId: defaultProjId,
    environment: 'dev',
    sdkKey: 'sdk_dev_default_key_123',
    clientKey: 'client_dev_default_key_123',
    createdAt: new Date()
  };
  const stagingEnv: ProjectEnvironment = {
    id: 'env-staging',
    projectId: defaultProjId,
    environment: 'staging',
    sdkKey: 'sdk_staging_default_key_123',
    clientKey: 'client_staging_default_key_123',
    createdAt: new Date()
  };
  const prodEnv: ProjectEnvironment = {
    id: 'env-prod',
    projectId: defaultProjId,
    environment: 'prod',
    sdkKey: 'sdk_prod_default_key_123',
    clientKey: 'client_prod_default_key_123',
    createdAt: new Date()
  };

  projectsDb[defaultProjId] = {
    id: defaultProjId,
    name: 'Default Project',
    environments: {
      dev: devEnv,
      staging: stagingEnv,
      prod: prodEnv
    },
    createdAt: new Date()
  };

  // 3. Create a Demo Flag
  const demoFlagId = 'flag-demo';
  const demoFlag: FlagDefinition = {
    id: demoFlagId,
    projectId: defaultProjId,
    key: 'show-new-dashboard',
    name: 'Show New Dashboard UI',
    type: 'bool',
    isKilled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [
      { id: 'v1', flagId: demoFlagId, name: 'true', value: true },
      { id: 'v2', flagId: demoFlagId, name: 'false', value: false }
    ],
    environments: {
      dev: {
        id: 'fe-dev',
        flagId: demoFlagId,
        environment: 'dev',
        enabled: true,
        defaultVariant: 'false',
        rules: [
          {
            id: 'rule-1',
            flagEnvironmentId: 'fe-dev',
            priority: 0,
            attribute: 'plan',
            operator: 'eq',
            value: 'premium',
            variant: 'true'
          }
        ],
        rolloutPercentage: 50
      },
      staging: {
        id: 'fe-staging',
        flagId: demoFlagId,
        environment: 'staging',
        enabled: true,
        defaultVariant: 'false',
        rules: [],
        rolloutPercentage: 20
      },
      prod: {
        id: 'fe-prod',
        flagId: demoFlagId,
        environment: 'prod',
        enabled: false,
        defaultVariant: 'false',
        rules: []
      }
    }
  };
  flagsDb[demoFlagId] = demoFlag;
}

// Implementations
export class MemoryProjectRepository implements IProjectRepository {
  async createProject(id: string, name: string): Promise<Project> {
    const proj: Project = {
      id,
      name,
      environments: {
        dev: {
          id: `env-dev-${id}`,
          projectId: id,
          environment: 'dev',
          sdkKey: `sdk_dev_${id}_${Math.random().toString(36).substr(2, 9)}`,
          clientKey: `client_dev_${id}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date()
        },
        staging: {
          id: `env-staging-${id}`,
          projectId: id,
          environment: 'staging',
          sdkKey: `sdk_staging_${id}_${Math.random().toString(36).substr(2, 9)}`,
          clientKey: `client_staging_${id}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date()
        },
        prod: {
          id: `env-prod-${id}`,
          projectId: id,
          environment: 'prod',
          sdkKey: `sdk_prod_${id}_${Math.random().toString(36).substr(2, 9)}`,
          clientKey: `client_prod_${id}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date()
        }
      },
      createdAt: new Date()
    };
    projectsDb[id] = proj;
    return proj;
  }

  async getProject(id: string): Promise<Project | null> {
    return projectsDb[id] || null;
  }

  async listProjects(): Promise<Project[]> {
    return Object.values(projectsDb);
  }

  async getEnvironmentBySdkKey(sdkKey: string): Promise<ProjectEnvironment | null> {
    for (const project of Object.values(projectsDb)) {
      for (const env of Object.values(project.environments)) {
        if (env.sdkKey === sdkKey || env.clientKey === sdkKey) {
          return env;
        }
      }
    }
    return null;
  }
}

export class MemoryFlagRepository implements IFlagRepository {
  async createFlag(flag: FlagDefinition): Promise<FlagDefinition> {
    flagsDb[flag.id] = { ...flag };
    return flagsDb[flag.id];
  }

  async getFlag(id: string): Promise<FlagDefinition | null> {
    const flag = flagsDb[id];
    return flag ? JSON.parse(JSON.stringify(flag)) : null;
  }

  async getFlagByKey(projectId: string, key: string): Promise<FlagDefinition | null> {
    const flag = Object.values(flagsDb).find(f => f.projectId === projectId && f.key === key);
    return flag ? JSON.parse(JSON.stringify(flag)) : null;
  }

  async listFlags(projectId: string): Promise<FlagDefinition[]> {
    return Object.values(flagsDb)
      .filter(f => f.projectId === projectId)
      .map(f => JSON.parse(JSON.stringify(f)));
  }

  async updateFlag(flag: FlagDefinition): Promise<FlagDefinition> {
    const updated = { ...flag, updatedAt: new Date() };
    flagsDb[flag.id] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  async deleteFlag(id: string): Promise<boolean> {
    if (flagsDb[id]) {
      delete flagsDb[id];
      return true;
    }
    return false;
  }
}

export class MemoryAdminRepository implements IAdminRepository {
  async createAdmin(admin: { id: string; email: string; passwordHash: string; name: string }): Promise<any> {
    const newAdmin = { ...admin, createdAt: new Date() };
    adminsDb[admin.id] = newAdmin;
    return newAdmin;
  }

  async getAdminByEmail(email: string): Promise<any | null> {
    const admin = Object.values(adminsDb).find(a => a.email === email);
    return admin || null;
  }

  async getAdminById(id: string): Promise<any | null> {
    return adminsDb[id] || null;
  }
}

export class MemoryAuditLogRepository implements IAuditLogRepository {
  async createAuditLog(log: AuditLog): Promise<AuditLog> {
    const newLog = { ...log, id: log.id || Math.random().toString(36).substr(2, 9), timestamp: new Date() };
    auditLogsDb.push(newLog);
    return newLog;
  }

  async listAuditLogs(projectId: string): Promise<AuditLog[]> {
    const flagIds = Object.values(flagsDb)
      .filter(f => f.projectId === projectId)
      .map(f => f.id);
    return auditLogsDb
      .filter(log => flagIds.includes(log.flagId))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

export class MemoryEvalLogRepository implements IEvalLogRepository {
  async logEvaluations(evals: FlagEvaluation[]): Promise<void> {
    evaluationsDb.push(...evals);
  }

  async getEvaluationStats(projectId: string, flagKey: string, daysLimit = 7): Promise<any> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysLimit);

    // Group evaluations by environment and variant name
    const stats: Record<string, Record<string, number>> = {
      dev: {},
      staging: {},
      prod: {}
    };

    const evals = evaluationsDb.filter(
      e => e.flagKey === flagKey && e.timestamp >= cutoff
    );

    for (const ev of evals) {
      const env = ev.environment;
      if (!stats[env]) stats[env] = {};
      stats[env][ev.variantReturned] = (stats[env][ev.variantReturned] || 0) + 1;
    }

    return stats;
  }
}

export class MemoryWebhookRepository implements IWebhookRepository {
  async createWebhook(webhook: { id: string; projectId: string; url: string; enabled: boolean }): Promise<any> {
    webhooksDb.push(webhook);
    return webhook;
  }

  async listWebhooks(projectId: string): Promise<any[]> {
    return webhooksDb.filter(w => w.projectId === projectId);
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const index = webhooksDb.findIndex(w => w.id === id);
    if (index !== -1) {
      webhooksDb.splice(index, 1);
      return true;
    }
    return false;
  }
}
