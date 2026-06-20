import { Project, ProjectEnvironment, FlagDefinition, AuditLog, FlagEvaluation } from '../../../shared/types';

export interface IProjectRepository {
  createProject(id: string, name: string): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  getEnvironmentBySdkKey(sdkKey: string): Promise<ProjectEnvironment | null>;
}

export interface IFlagRepository {
  createFlag(flag: FlagDefinition): Promise<FlagDefinition>;
  getFlag(id: string): Promise<FlagDefinition | null>;
  getFlagByKey(projectId: string, key: string): Promise<FlagDefinition | null>;
  listFlags(projectId: string): Promise<FlagDefinition[]>;
  updateFlag(flag: FlagDefinition): Promise<FlagDefinition>;
  deleteFlag(id: string): Promise<boolean>;
}

export interface IAdminRepository {
  createAdmin(admin: { id: string; email: string; passwordHash: string; name: string }): Promise<any>;
  getAdminByEmail(email: string): Promise<any | null>;
  getAdminById(id: string): Promise<any | null>;
}

export interface IAuditLogRepository {
  createAuditLog(log: AuditLog): Promise<AuditLog>;
  listAuditLogs(projectId: string): Promise<AuditLog[]>;
}

export interface IEvalLogRepository {
  logEvaluations(evals: FlagEvaluation[]): Promise<void>;
  getEvaluationStats(projectId: string, flagKey: string, daysLimit?: number): Promise<any>;
}

export interface IWebhookRepository {
  createWebhook(webhook: { id: string; projectId: string; url: string; enabled: boolean }): Promise<any>;
  listWebhooks(projectId: string): Promise<any[]>;
  deleteWebhook(id: string): Promise<boolean>;
}
