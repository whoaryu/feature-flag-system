import { Pool } from 'pg';
import {
  IProjectRepository,
  IFlagRepository,
  IAdminRepository,
  IAuditLogRepository,
  IEvalLogRepository,
  IWebhookRepository
} from './interfaces';
import { Project, ProjectEnvironment, FlagDefinition, AuditLog, FlagEvaluation } from '../../../shared/types';

export class PostgresProjectRepository implements IProjectRepository {
  constructor(private pool: Pool) {}

  async createProject(id: string, name: string): Promise<Project> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO projects (id, name) VALUES ($1, $2)',
        [id, name]
      );

      const envs: ('dev' | 'staging' | 'prod')[] = ['dev', 'staging', 'prod'];
      const projectEnvs: Record<string, ProjectEnvironment> = {};

      for (const envName of envs) {
        const envId = `${id}-${envName}`;
        const sdkKey = `sdk_${envName}_${id}_${Math.random().toString(36).substr(2, 9)}`;
        const clientKey = `client_${envName}_${id}_${Math.random().toString(36).substr(2, 9)}`;

        const res = await client.query(
          `INSERT INTO project_environments (id, project_id, environment, sdk_key, client_key) 
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [envId, id, envName, sdkKey, clientKey]
        );

        const row = res.rows[0];
        projectEnvs[envName] = {
          id: row.id,
          projectId: row.project_id,
          environment: row.environment,
          sdkKey: row.sdk_key,
          clientKey: row.client_key,
          createdAt: row.created_at
        };
      }

      await client.query('COMMIT');
      return {
        id,
        name,
        environments: projectEnvs as any,
        createdAt: new Date()
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getProject(id: string): Promise<Project | null> {
    const res = await this.pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const projectRow = res.rows[0];

    const envRes = await this.pool.query('SELECT * FROM project_environments WHERE project_id = $1', [id]);
    const environments: Record<string, ProjectEnvironment> = {};
    for (const row of envRes.rows) {
      environments[row.environment] = {
        id: row.id,
        projectId: row.project_id,
        environment: row.environment,
        sdkKey: row.sdk_key,
        clientKey: row.client_key,
        createdAt: row.created_at
      };
    }

    return {
      id: projectRow.id,
      name: projectRow.name,
      environments: environments as any,
      createdAt: projectRow.created_at
    };
  }

  async listProjects(): Promise<Project[]> {
    const res = await this.pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    const projects: Project[] = [];

    for (const projectRow of res.rows) {
      const envRes = await this.pool.query('SELECT * FROM project_environments WHERE project_id = $1', [projectRow.id]);
      const environments: Record<string, ProjectEnvironment> = {};
      for (const row of envRes.rows) {
        environments[row.environment] = {
          id: row.id,
          projectId: row.project_id,
          environment: row.environment,
          sdkKey: row.sdk_key,
          clientKey: row.client_key,
          createdAt: row.created_at
        };
      }
      projects.push({
        id: projectRow.id,
        name: projectRow.name,
        environments: environments as any,
        createdAt: projectRow.created_at
      });
    }

    return projects;
  }

  async getEnvironmentBySdkKey(sdkKey: string): Promise<ProjectEnvironment | null> {
    const res = await this.pool.query(
      'SELECT * FROM project_environments WHERE sdk_key = $1 OR client_key = $1',
      [sdkKey]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      projectId: row.project_id,
      environment: row.environment,
      sdkKey: row.sdk_key,
      clientKey: row.client_key,
      createdAt: row.created_at
    };
  }
}

export class PostgresFlagRepository implements IFlagRepository {
  constructor(private pool: Pool) {}

  private async assembleFlag(flagRow: any, client: any): Promise<FlagDefinition> {
    const flagId = flagRow.id;

    // 1. Get variants
    const varRes = await client.query('SELECT * FROM flag_variants WHERE flag_id = $1', [flagId]);
    const variants = varRes.rows.map((r: any) => ({
      id: r.id,
      flagId: r.flag_id,
      name: r.name,
      value: r.value
    }));

    // 2. Get flag environments
    const envRes = await client.query('SELECT * FROM flag_environments WHERE flag_id = $1', [flagId]);
    const environments: Record<string, any> = {};

    for (const envRow of envRes.rows) {
      // Get rules for this environment
      const rulesRes = await client.query(
        'SELECT * FROM flag_rules WHERE flag_environment_id = $1 ORDER BY priority ASC',
        [envRow.id]
      );
      const rules = rulesRes.rows.map((r: any) => ({
        id: r.id,
        flagEnvironmentId: r.flag_environment_id,
        priority: r.priority,
        attribute: r.attribute,
        operator: r.operator,
        value: r.value,
        variant: r.variant
      }));

      environments[envRow.environment] = {
        id: envRow.id,
        flagId: envRow.flag_id,
        environment: envRow.environment,
        enabled: envRow.enabled,
        defaultVariant: envRow.default_variant,
        rules,
        rolloutPercentage: envRow.rollout_percentage,
        rolloutWeights: envRow.rollout_weights
      };
    }

    return {
      id: flagRow.id,
      projectId: flagRow.project_id,
      key: flagRow.key,
      name: flagRow.name,
      type: flagRow.type,
      isKilled: flagRow.is_killed,
      variants,
      environments: environments as any,
      createdAt: flagRow.created_at,
      updatedAt: flagRow.updated_at
    };
  }

  async createFlag(flag: FlagDefinition): Promise<FlagDefinition> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert Flag
      await client.query(
        `INSERT INTO flags (id, project_id, key, name, type, is_killed, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [flag.id, flag.projectId, flag.key, flag.name, flag.type, flag.isKilled, flag.createdAt, flag.updatedAt]
      );

      // Insert Variants
      for (const v of flag.variants) {
        await client.query(
          'INSERT INTO flag_variants (id, flag_id, name, value) VALUES ($1, $2, $3, $4)',
          [v.id, flag.id, v.name, JSON.stringify(v.value)]
        );
      }

      // Insert Environments & Rules
      const envs: ('dev' | 'staging' | 'prod')[] = ['dev', 'staging', 'prod'];
      for (const envName of envs) {
        const env = flag.environments[envName];
        if (!env) continue;

        await client.query(
          `INSERT INTO flag_environments (id, flag_id, environment, enabled, default_variant, rollout_percentage, rollout_weights) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            env.id,
            flag.id,
            envName,
            env.enabled,
            env.defaultVariant,
            env.rolloutPercentage ?? null,
            env.rolloutWeights ? JSON.stringify(env.rolloutWeights) : null
          ]
        );

        for (const rule of env.rules) {
          await client.query(
            `INSERT INTO flag_rules (id, flag_environment_id, priority, attribute, operator, value, variant) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [rule.id, env.id, rule.priority, rule.attribute, rule.operator, rule.value, rule.variant]
          );
        }
      }

      await client.query('COMMIT');
      return flag;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getFlag(id: string): Promise<FlagDefinition | null> {
    const client = this.pool;
    const res = await client.query('SELECT * FROM flags WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.assembleFlag(res.rows[0], client);
  }

  async getFlagByKey(projectId: string, key: string): Promise<FlagDefinition | null> {
    const client = this.pool;
    const res = await client.query('SELECT * FROM flags WHERE project_id = $1 AND key = $2', [projectId, key]);
    if (res.rows.length === 0) return null;
    return this.assembleFlag(res.rows[0], client);
  }

  async listFlags(projectId: string): Promise<FlagDefinition[]> {
    const client = this.pool;
    const res = await client.query('SELECT * FROM flags WHERE project_id = $1 ORDER BY key ASC', [projectId]);
    const flags: FlagDefinition[] = [];
    for (const row of res.rows) {
      flags.push(await this.assembleFlag(row, client));
    }
    return flags;
  }

  async updateFlag(flag: FlagDefinition): Promise<FlagDefinition> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Update Flag basic fields
      await client.query(
        `UPDATE flags SET name = $1, type = $2, is_killed = $3, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4`,
        [flag.name, flag.type, flag.isKilled, flag.id]
      );

      // Recreate variants (simplest way to sync)
      await client.query('DELETE FROM flag_variants WHERE flag_id = $1', [flag.id]);
      for (const v of flag.variants) {
        await client.query(
          'INSERT INTO flag_variants (id, flag_id, name, value) VALUES ($1, $2, $3, $4)',
          [v.id, flag.id, v.name, JSON.stringify(v.value)]
        );
      }

      // Recreate environments and rules
      const envs: ('dev' | 'staging' | 'prod')[] = ['dev', 'staging', 'prod'];
      for (const envName of envs) {
        const env = flag.environments[envName];
        if (!env) continue;

        // Check if environment exists or delete and recreate
        await client.query('DELETE FROM flag_environments WHERE flag_id = $1 AND environment = $2', [flag.id, envName]);

        await client.query(
          `INSERT INTO flag_environments (id, flag_id, environment, enabled, default_variant, rollout_percentage, rollout_weights) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            env.id,
            flag.id,
            envName,
            env.enabled,
            env.defaultVariant,
            env.rolloutPercentage ?? null,
            env.rolloutWeights ? JSON.stringify(env.rolloutWeights) : null
          ]
        );

        for (const rule of env.rules) {
          await client.query(
            `INSERT INTO flag_rules (id, flag_environment_id, priority, attribute, operator, value, variant) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [rule.id, env.id, rule.priority, rule.attribute, rule.operator, rule.value, rule.variant]
          );
        }
      }

      await client.query('COMMIT');
      return this.getFlag(flag.id) as Promise<FlagDefinition>;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteFlag(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM flags WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

export class PostgresAdminRepository implements IAdminRepository {
  constructor(private pool: Pool) {}

  async createAdmin(admin: { id: string; email: string; passwordHash: string; name: string }): Promise<any> {
    const res = await this.pool.query(
      `INSERT INTO admins (id, email, password_hash, name) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [admin.id, admin.email, admin.passwordHash, admin.name]
    );
    return res.rows[0];
  }

  async getAdminByEmail(email: string): Promise<any | null> {
    const res = await this.pool.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      createdAt: row.created_at
    };
  }

  async getAdminById(id: string): Promise<any | null> {
    const res = await this.pool.query('SELECT * FROM admins WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      createdAt: row.created_at
    };
  }
}

export class PostgresAuditLogRepository implements IAuditLogRepository {
  constructor(private pool: Pool) {}

  async createAuditLog(log: AuditLog): Promise<AuditLog> {
    const res = await this.pool.query(
      `INSERT INTO audit_log (id, flag_id, flag_key, actor_id, actor_name, action, environment, before_snapshot, after_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        log.id,
        log.flagId,
        log.flagKey,
        log.actorId,
        log.actorName,
        log.action,
        log.environment || null,
        log.beforeSnapshot ? JSON.stringify(log.beforeSnapshot) : null,
        log.afterSnapshot ? JSON.stringify(log.afterSnapshot) : null
      ]
    );
    const row = res.rows[0];
    return {
      id: row.id,
      flagId: row.flag_id,
      flagKey: row.flag_key,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      environment: row.environment,
      beforeSnapshot: row.before_snapshot,
      afterSnapshot: row.after_snapshot,
      timestamp: row.timestamp
    };
  }

  async listAuditLogs(projectId: string): Promise<AuditLog[]> {
    const res = await this.pool.query(
      `SELECT a.* FROM audit_log a 
       JOIN flags f ON a.flag_id = f.id 
       WHERE f.project_id = $1 
       ORDER BY a.timestamp DESC`,
      [projectId]
    );
    return res.rows.map(row => ({
      id: row.id,
      flagId: row.flag_id,
      flagKey: row.flag_key,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      environment: row.environment,
      beforeSnapshot: row.before_snapshot,
      afterSnapshot: row.after_snapshot,
      timestamp: row.timestamp
    }));
  }
}

export class PostgresEvalLogRepository implements IEvalLogRepository {
  constructor(private pool: Pool) {}

  async logEvaluations(evals: FlagEvaluation[]): Promise<void> {
    if (evals.length === 0) return;

    // Perform bulk insert using multi-row values query
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const valueStrings: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      for (const ev of evals) {
        valueStrings.push(`($${paramCount}, $${paramCount + 1}, $${paramCount + 2}, $${paramCount + 3}, $${paramCount + 4}, $${paramCount + 5}, $${paramCount + 6})`);
        values.push(
          ev.id,
          ev.flagId,
          ev.flagKey,
          ev.environment,
          ev.variantReturned,
          ev.userId,
          ev.timestamp
        );
        paramCount += 7;
      }

      const queryText = `
        INSERT INTO flag_evaluations (id, flag_id, flag_key, environment, variant_returned, user_id, timestamp) 
        VALUES ${valueStrings.join(', ')}
      `;

      await client.query(queryText, values);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getEvaluationStats(projectId: string, flagKey: string, daysLimit = 7): Promise<any> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysLimit);

    const res = await this.pool.query(
      `SELECT e.environment, e.variant_returned, count(*) as count 
       FROM flag_evaluations e
       JOIN flags f ON e.flag_id = f.id
       WHERE f.project_id = $1 AND e.flag_key = $2 AND e.timestamp >= $3
       GROUP BY e.environment, e.variant_returned`,
      [projectId, flagKey, cutoff]
    );

    const stats: Record<string, Record<string, number>> = {
      dev: {},
      staging: {},
      prod: {}
    };

    for (const row of res.rows) {
      const env = row.environment;
      if (!stats[env]) stats[env] = {};
      stats[env][row.variant_returned] = parseInt(row.count, 10);
    }

    return stats;
  }
}

export class PostgresWebhookRepository implements IWebhookRepository {
  constructor(private pool: Pool) {}

  async createWebhook(webhook: { id: string; projectId: string; url: string; enabled: boolean }): Promise<any> {
    const res = await this.pool.query(
      `INSERT INTO webhooks (id, project_id, url, enabled) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [webhook.id, webhook.projectId, webhook.url, webhook.enabled]
    );
    return res.rows[0];
  }

  async listWebhooks(projectId: string): Promise<any[]> {
    const res = await this.pool.query(
      'SELECT * FROM webhooks WHERE project_id = $1',
      [projectId]
    );
    return res.rows;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM webhooks WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
