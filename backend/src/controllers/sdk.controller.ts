import { Request, Response } from 'express';
import { getProjectRepo, getFlagRepo, getEvalLogRepo } from '../repositories';
import { getPubSubService } from '../services/pubsub';
import { FlagEvaluation } from '../../../shared/types';

function uuid() {
  return Math.random().toString(36).substr(2, 9);
}

export async function bootstrap(req: Request, res: Response) {
  const envKey = req.query.envKey || req.headers['x-sdk-key'];

  if (!envKey || typeof envKey !== 'string') {
    return res.status(400).json({ error: 'SDK/Client Environment key is required (query envKey or header x-sdk-key).' });
  }

  try {
    const projectRepo = getProjectRepo();
    const env = await projectRepo.getEnvironmentBySdkKey(envKey);
    if (!env) {
      return res.status(401).json({ error: 'Invalid Environment SDK/Client Key.' });
    }

    const flagRepo = getFlagRepo();
    const allFlags = await flagRepo.listFlags(env.projectId);

    // To make it lean, only return the active configuration details needed by client SDK
    // The client SDK just needs: isKilled, variants, environments[envName]
    const bootstrapped = allFlags.map(flag => {
      const flagEnv = flag.environments[env.environment];
      return {
        id: flag.id,
        key: flag.key,
        name: flag.name,
        type: flag.type,
        isKilled: flag.isKilled,
        variants: flag.variants,
        enabled: flagEnv?.enabled ?? false,
        defaultVariant: flagEnv?.defaultVariant ?? '',
        rules: flagEnv?.rules ?? [],
        rolloutPercentage: flagEnv?.rolloutPercentage,
        rolloutWeights: flagEnv?.rolloutWeights
      };
    });

    res.json({
      environment: env.environment,
      flags: bootstrapped
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to bootstrap SDK.', details: e.message });
  }
}

export async function stream(req: Request, res: Response) {
  const envKey = req.query.envKey || req.headers['x-sdk-key'];

  if (!envKey || typeof envKey !== 'string') {
    return res.status(400).json({ error: 'SDK Environment Key is required.' });
  }

  try {
    const projectRepo = getProjectRepo();
    const env = await projectRepo.getEnvironmentBySdkKey(envKey);
    if (!env) {
      return res.status(401).json({ error: 'Invalid Environment SDK/Client Key.' });
    }

    // Set headers for Server-Sent Events (SSE)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Prevent Nginx buffering
    });

    // Write initial heartbeat
    res.write(': heartbeat\n\n');

    // Subscribe to pub/sub updates
    const pubSub = getPubSubService();
    const unsubscribe = pubSub.subscribe(env.projectId, env.environment, (data) => {
      res.write(`event: flag-update\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });

    // Keep-alive heartbeat every 30 seconds
    const heartbeatInterval = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    // Clean up when client disconnects
    req.on('close', () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
      console.log(`[SSE] Client disconnected for environment ${env.environment}`);
    });
  } catch (e: any) {
    console.error('[SSE] Error establishing stream:', e);
    res.status(500).end();
  }
}

export async function logEvaluations(req: Request, res: Response) {
  const { sdkKey, evaluations } = req.body;

  if (!sdkKey || !evaluations || !Array.isArray(evaluations)) {
    return res.status(400).json({ error: 'sdkKey and evaluations array are required.' });
  }

  try {
    const projectRepo = getProjectRepo();
    const env = await projectRepo.getEnvironmentBySdkKey(sdkKey);
    if (!env) {
      return res.status(401).json({ error: 'Invalid Environment Key.' });
    }

    const flagRepo = getFlagRepo();
    const flags = await flagRepo.listFlags(env.projectId);

    const mappedEvals: FlagEvaluation[] = [];

    for (const ev of evaluations) {
      const flag = flags.find(f => f.key === ev.flagKey);
      if (!flag) continue; // Skip if flag does not exist

      mappedEvals.push({
        id: `eval-${uuid()}`,
        flagId: flag.id,
        flagKey: ev.flagKey,
        environment: env.environment,
        variantReturned: ev.variantReturned,
        userId: ev.userId,
        timestamp: ev.timestamp ? new Date(ev.timestamp) : new Date()
      });
    }

    if (mappedEvals.length > 0) {
      await getEvalLogRepo().logEvaluations(mappedEvals);
    }

    res.json({ success: true, loggedCount: mappedEvals.length });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to log evaluations.', details: e.message });
  }
}
