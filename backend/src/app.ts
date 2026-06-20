import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middlewares/auth.middleware';
import * as authController from './controllers/auth.controller';
import * as flagController from './controllers/flag.controller';
import * as sdkController from './controllers/sdk.controller';
import { getProjectRepo } from './repositories';

const app = express();

app.use(cors());
app.use(express.json());

// Heartbeat
app.get('/health', (req, res) => {
  res.json({ status: 'UP', time: new Date() });
});

// Admin Authentication Routes
app.post('/api/v1/auth/signup', authController.signup);
app.post('/api/v1/auth/login', authController.login);
app.get('/api/v1/auth/me', authMiddleware as any, authController.getMe as any);

// Admin Projects Routes
app.get('/api/v1/projects', authMiddleware as any, async (req, res) => {
  try {
    const projects = await getProjectRepo().listProjects();
    res.json(projects);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch projects.', details: e.message });
  }
});

app.post('/api/v1/projects', authMiddleware as any, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required.' });
  }
  try {
    const id = `proj-${Math.random().toString(36).substr(2, 9)}`;
    const project = await getProjectRepo().createProject(id, name);
    res.status(201).json(project);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to create project.', details: e.message });
  }
});

// Admin Flags Routes
app.get('/api/v1/flags', authMiddleware as any, flagController.listFlags as any);
app.get('/api/v1/flags/:id', authMiddleware as any, flagController.getFlag as any);
app.post('/api/v1/flags', authMiddleware as any, flagController.createFlag as any);
app.put('/api/v1/flags/:id', authMiddleware as any, flagController.updateFlag as any);
app.delete('/api/v1/flags/:id', authMiddleware as any, flagController.deleteFlag as any);
app.get('/api/v1/flags/:id/stats', authMiddleware as any, flagController.getFlagStats as any);

// Admin Audit Logs
app.get('/api/v1/audit-logs', authMiddleware as any, flagController.getAuditLogs as any);

// Client SDK Routes (No authMiddleware because SDKs authenticate via x-sdk-key or query envKey)
app.get('/api/v1/sdk/bootstrap', sdkController.bootstrap);
app.get('/api/v1/sdk/stream', sdkController.stream);
app.post('/api/v1/sdk/evaluations', sdkController.logEvaluations);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Error Handler] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.'
  });
});

export default app;
