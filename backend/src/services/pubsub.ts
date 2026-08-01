import EventEmitter from 'events';

// Redis has been removed to simplify single-instance deployments.
// If you scale to multiple backend instances, you can uncomment Redis support here
// and add the 'redis' dependency back to package.json.

export interface IPubSubService {
  publish(projectId: string, environment: string, data: { flagKey: string; updatedAt: Date }): Promise<void>;
  subscribe(projectId: string, environment: string, callback: (data: any) => void): () => void;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

// 1. In-Memory Pub/Sub Implementation
export class MemoryPubSubService implements IPubSubService {
  private emitter = new EventEmitter();

  async initialize(): Promise<void> {
    console.log('[PubSub] Initialized in-memory event bus.');
  }

  async publish(projectId: string, environment: string, data: { flagKey: string; updatedAt: Date }): Promise<void> {
    const channel = `flags:${projectId}:${environment}`;
    this.emitter.emit(channel, data);
  }

  subscribe(projectId: string, environment: string, callback: (data: any) => void): () => void {
    const channel = `flags:${projectId}:${environment}`;
    this.emitter.on(channel, callback);
    return () => {
      this.emitter.off(channel, callback);
    };
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

// Factory to select implementation based on config (always memory-based now)
let pubSubInstance: IPubSubService;

export function getPubSubService(): IPubSubService {
  if (pubSubInstance) return pubSubInstance;
  pubSubInstance = new MemoryPubSubService();
  return pubSubInstance;
}

