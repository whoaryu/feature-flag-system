import EventEmitter from 'events';
import { createClient } from 'redis';

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

// 2. Redis Pub/Sub Implementation
export class RedisPubSubService implements IPubSubService {
  private pubClient: ReturnType<typeof createClient> | null = null;
  private subClient: ReturnType<typeof createClient> | null = null;
  private emitter = new EventEmitter();
  private redisUrl: string;

  constructor(redisUrl = 'redis://localhost:6379') {
    this.redisUrl = redisUrl;
  }

  async initialize(): Promise<void> {
    try {
      this.pubClient = createClient({ url: this.redisUrl });
      this.subClient = createClient({ url: this.redisUrl });

      await Promise.all([
        this.pubClient.connect(),
        this.subClient.connect()
      ]);

      console.log('[PubSub] Redis Pub/Sub connected successfully.');
    } catch (e) {
      console.error('[PubSub] Failed to initialize Redis. Falling back...', e);
      throw e;
    }
  }

  async publish(projectId: string, environment: string, data: { flagKey: string; updatedAt: Date }): Promise<void> {
    if (!this.pubClient) return;
    const channel = `flags:${projectId}:${environment}`;
    await this.pubClient.publish(channel, JSON.stringify(data));
  }

  subscribe(projectId: string, environment: string, callback: (data: any) => void): () => void {
    const channel = `flags:${projectId}:${environment}`;
    
    // Check if we already have a subscription for this channel in our local emitter
    const listenerCount = this.emitter.listenerCount(channel);
    
    // Add local listener
    this.emitter.on(channel, callback);

    // If this is the first listener, subscribe to Redis
    if (listenerCount === 0 && this.subClient) {
      this.subClient.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message);
          // Convert string timestamp back to Date object
          parsed.updatedAt = new Date(parsed.updatedAt);
          this.emitter.emit(channel, parsed);
        } catch (e) {
          console.error('[PubSub] Redis payload parsing failed', e);
        }
      }).catch(err => {
        console.error(`[PubSub] Failed subscribing to Redis channel ${channel}`, err);
      });
    }

    return () => {
      this.emitter.off(channel, callback);
      // If no more listeners, unsubscribe from Redis
      if (this.emitter.listenerCount(channel) === 0 && this.subClient) {
        this.subClient.unsubscribe(channel).catch(err => {
          console.error(`[PubSub] Failed unsubscribing from Redis channel ${channel}`, err);
        });
      }
    };
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
    if (this.pubClient) await this.pubClient.quit();
    if (this.subClient) await this.subClient.quit();
  }
}

// Factory to select implementation based on config
let pubSubInstance: IPubSubService;

export function getPubSubService(): IPubSubService {
  if (pubSubInstance) return pubSubInstance;

  const type = process.env.CACHE_TYPE || 'memory';
  if (type === 'redis') {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    pubSubInstance = new RedisPubSubService(redisUrl);
  } else {
    pubSubInstance = new MemoryPubSubService();
  }

  return pubSubInstance;
}
