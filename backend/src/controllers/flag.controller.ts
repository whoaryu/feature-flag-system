import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  getFlagRepo,
  getAuditLogRepo,
  getEvalLogRepo,
  getWebhookRepo
} from '../repositories';
import { getPubSubService } from '../services/pubsub';
import { WebhookService } from '../services/webhook';
import { FlagDefinition, FlagEnvironment, AuditLog } from '../../../shared/types';

/**
 * Helper to generate random IDs
 */
function uuid() {
  return Math.random().toString(36).substr(2, 9);
}

export async function listFlags(req: AuthenticatedRequest, res: Response) {
  const { projectId } = req.query;
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'projectId query parameter is required.' });
  }

  try {
    const flags = await getFlagRepo().listFlags(projectId);
    res.json(flags);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to list flags.', details: e.message });
  }
}

export async function getFlag(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  try {
    const flag = await getFlagRepo().getFlag(id);
    if (!flag) {
      return res.status(404).json({ error: 'Flag not found.' });
    }
    res.json(flag);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to retrieve flag.', details: e.message });
  }
}

export async function createFlag(req: AuthenticatedRequest, res: Response) {
  const { projectId, key, name, type, variants } = req.body;
  const actor = req.admin!;

  if (!projectId || !key || !name || !type || !variants || !Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({ error: 'projectId, key, name, type, and variants are required.' });
  }

  try {
    const flagRepo = getFlagRepo();
    const existing = await flagRepo.getFlagByKey(projectId, key);
    if (existing) {
      return res.status(400).json({ error: `Flag with key "${key}" already exists in this project.` });
    }

    const flagId = `flag-${uuid()}`;
    const mappedVariants = variants.map((v: any, index: number) => ({
      id: v.id || `var-${uuid()}-${index}`,
      flagId,
      name: v.name,
      value: v.value
    }));

    // Default variant is the first one
    const defaultVarName = mappedVariants[0].name;

    const environments: Record<'dev' | 'staging' | 'prod', FlagEnvironment> = {
      dev: {
        id: `fe-dev-${uuid()}`,
        flagId,
        environment: 'dev',
        enabled: false,
        defaultVariant: defaultVarName,
        rules: []
      },
      staging: {
        id: `fe-staging-${uuid()}`,
        flagId,
        environment: 'staging',
        enabled: false,
        defaultVariant: defaultVarName,
        rules: []
      },
      prod: {
        id: `fe-prod-${uuid()}`,
        flagId,
        environment: 'prod',
        enabled: false,
        defaultVariant: defaultVarName,
        rules: []
      }
    };

    const flag: FlagDefinition = {
      id: flagId,
      projectId,
      key,
      name,
      type,
      isKilled: false,
      variants: mappedVariants,
      environments,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const createdFlag = await flagRepo.createFlag(flag);

    // Create Audit Log
    const auditLog: AuditLog = {
      id: `audit-${uuid()}`,
      flagId,
      flagKey: key,
      actorId: actor.id,
      actorName: actor.name,
      action: 'CREATE',
      afterSnapshot: createdFlag,
      timestamp: new Date()
    };
    await getAuditLogRepo().createAuditLog(auditLog);

    // Trigger Webhooks
    const webhookService = new WebhookService(getWebhookRepo());
    await webhookService.triggerWebhooks(projectId, {
      event: 'flag.created',
      projectId,
      flagKey: key,
      actor: actor.name,
      timestamp: new Date()
    });

    res.status(201).json(createdFlag);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to create flag.', details: e.message });
  }
}

export async function updateFlag(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const updatedData = req.body;
  const actor = req.admin!;

  try {
    const flagRepo = getFlagRepo();
    const beforeFlag = await flagRepo.getFlag(id);

    if (!beforeFlag) {
      return res.status(404).json({ error: 'Flag not found.' });
    }

    // Prepare update structure
    const updatedFlag: FlagDefinition = {
      ...beforeFlag,
      name: updatedData.name ?? beforeFlag.name,
      type: updatedData.type ?? beforeFlag.type,
      isKilled: updatedData.isKilled ?? beforeFlag.isKilled,
      variants: updatedData.variants ?? beforeFlag.variants,
      environments: beforeFlag.environments,
      updatedAt: new Date()
    };

    // Update Environments (we allow passing environment modifications, e.g. { environments: { dev: { enabled: true } } })
    if (updatedData.environments) {
      const envs: ('dev' | 'staging' | 'prod')[] = ['dev', 'staging', 'prod'];
      for (const envName of envs) {
        if (updatedData.environments[envName]) {
          const incomingEnv = updatedData.environments[envName];
          updatedFlag.environments[envName] = {
            ...beforeFlag.environments[envName],
            enabled: incomingEnv.enabled ?? beforeFlag.environments[envName].enabled,
            defaultVariant: incomingEnv.defaultVariant ?? beforeFlag.environments[envName].defaultVariant,
            rules: incomingEnv.rules ?? beforeFlag.environments[envName].rules,
            rolloutPercentage: incomingEnv.rolloutPercentage !== undefined ? incomingEnv.rolloutPercentage : beforeFlag.environments[envName].rolloutPercentage,
            rolloutWeights: incomingEnv.rolloutWeights !== undefined ? incomingEnv.rolloutWeights : beforeFlag.environments[envName].rolloutWeights
          };
        }
      }
    }

    const savedFlag = await flagRepo.updateFlag(updatedFlag);

    // Write Audit Log
    const auditLog: AuditLog = {
      id: `audit-${uuid()}`,
      flagId: id,
      flagKey: savedFlag.key,
      actorId: actor.id,
      actorName: actor.name,
      action: beforeFlag.isKilled !== savedFlag.isKilled ? 'KILL' : 'UPDATE',
      beforeSnapshot: beforeFlag,
      afterSnapshot: savedFlag,
      timestamp: new Date()
    };
    await getAuditLogRepo().createAuditLog(auditLog);

    // Identify which environments had modifications to notify clients and webhooks
    const pubSub = getPubSubService();
    const webhookService = new WebhookService(getWebhookRepo());
    
    const environments: ('dev' | 'staging' | 'prod')[] = ['dev', 'staging', 'prod'];
    
    for (const envName of environments) {
      const beforeEnv = beforeFlag.environments[envName];
      const afterEnv = savedFlag.environments[envName];

      const envChanged = JSON.stringify(beforeEnv) !== JSON.stringify(afterEnv) || 
                         beforeFlag.isKilled !== savedFlag.isKilled;

      if (envChanged) {
        console.log(`[SSE] Broadcasting update for flag ${savedFlag.key} in ${envName}`);
        
        // 1. Publish real-time notification to pub/sub (which updates active SSE client connections)
        await pubSub.publish(savedFlag.projectId, envName, {
          flagKey: savedFlag.key,
          updatedAt: savedFlag.updatedAt
        });

        // 2. Trigger webhooks specifically for this environment change
        await webhookService.triggerWebhooks(savedFlag.projectId, {
          event: beforeEnv.enabled !== afterEnv.enabled ? 'flag.toggled' : 
                 beforeFlag.isKilled !== savedFlag.isKilled ? 'flag.killed' : 'flag.updated',
          projectId: savedFlag.projectId,
          flagKey: savedFlag.key,
          environment: envName,
          actor: actor.name,
          timestamp: new Date()
        });
      }
    }

    res.json(savedFlag);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to update flag.', details: e.message });
  }
}

export async function deleteFlag(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const actor = req.admin!;

  try {
    const flagRepo = getFlagRepo();
    const flag = await flagRepo.getFlag(id);

    if (!flag) {
      return res.status(404).json({ error: 'Flag not found.' });
    }

    await flagRepo.deleteFlag(id);

    // Audit Log
    const auditLog: AuditLog = {
      id: `audit-${uuid()}`,
      flagId: id,
      flagKey: flag.key,
      actorId: actor.id,
      actorName: actor.name,
      action: 'DELETE',
      beforeSnapshot: flag,
      timestamp: new Date()
    };
    await getAuditLogRepo().createAuditLog(auditLog);

    // Webhooks
    const webhookService = new WebhookService(getWebhookRepo());
    await webhookService.triggerWebhooks(flag.projectId, {
      event: 'flag.deleted',
      projectId: flag.projectId,
      flagKey: flag.key,
      actor: actor.name,
      timestamp: new Date()
    });

    // Notify SDKs that this flag is gone (by publishing to dev, staging, prod)
    const pubSub = getPubSubService();
    const envs: ('dev' | 'staging' | 'prod')[] = ['dev', 'staging', 'prod'];
    for (const envName of envs) {
      await pubSub.publish(flag.projectId, envName, {
        flagKey: flag.key,
        updatedAt: new Date()
      });
    }

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to delete flag.', details: e.message });
  }
}

export async function getAuditLogs(req: AuthenticatedRequest, res: Response) {
  const { projectId } = req.query;
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'projectId query parameter is required.' });
  }

  try {
    const logs = await getAuditLogRepo().listAuditLogs(projectId);
    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to get audit logs.', details: e.message });
  }
}

export async function getFlagStats(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { projectId } = req.query;

  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'projectId is required.' });
  }

  try {
    const flag = await getFlagRepo().getFlag(id);
    if (!flag) {
      return res.status(404).json({ error: 'Flag not found.' });
    }

    const stats = await getEvalLogRepo().getEvaluationStats(projectId, flag.key);
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to get flag stats.', details: e.message });
  }
}
