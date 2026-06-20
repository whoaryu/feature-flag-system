import { evaluate } from '../shared/evaluator';
import { UserContext, EvalResult, FlagVariant } from '../shared/types';

export interface SdkOptions {
  baseUrl?: string;
  bootstrapInterval?: number; // MS between polls (fallback/sync)
  flushInterval?: number; // MS between evaluation queue flushes
  enableStream?: boolean; // Use SSE for real-time updates
  eventSourceClass?: any; // Custom EventSource (e.g. for Node.js)
}

interface CachedFlag {
  id: string;
  key: string;
  name: string;
  type: 'bool' | 'string' | 'number' | 'json';
  isKilled: boolean;
  variants: FlagVariant[];
  enabled: boolean;
  defaultVariant: string;
  rules: any[];
  rolloutPercentage?: number;
  rolloutWeights?: Record<string, number>;
}

export class FeatureFlagClient {
  private sdkKey: string;
  private baseUrl: string;
  private bootstrapInterval: number;
  private flushInterval: number;
  private enableStream: boolean;
  private eventSourceClass: any;

  private flags: Record<string, CachedFlag> = {};
  private environment: 'dev' | 'staging' | 'prod' = 'dev';
  private evaluationQueue: Array<{
    flagKey: string;
    variantReturned: string;
    userId: string;
    timestamp: string;
  }> = [];

  private pollIntervalId: any = null;
  private flushIntervalId: any = null;
  private eventSource: any = null;
  private initialized = false;
  private onUpdateCallback: (() => void) | null = null;

  constructor(sdkKey: string, options: SdkOptions = {}) {
    this.sdkKey = sdkKey;
    this.baseUrl = (options.baseUrl || 'http://localhost:3001').replace(/\/$/, '');
    this.bootstrapInterval = options.bootstrapInterval || 60000; // 60s default
    this.flushInterval = options.flushInterval || 10000; // 10s default
    this.enableStream = options.enableStream !== false;
    this.eventSourceClass = options.eventSourceClass || (typeof window !== 'undefined' ? (window as any).EventSource : null);

    this.loadFromStorage();
  }

  /**
   * Initializes the SDK: fetches flags and starts streaming/polling.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // First fetch
    await this.bootstrap();

    // Setup polling sync as a fallback
    if (this.bootstrapInterval > 0) {
      this.pollIntervalId = setInterval(() => this.bootstrap(), this.bootstrapInterval);
    }

    // Setup real-time updates
    if (this.enableStream) {
      this.connectStream();
    }

    // Setup analytics batch logging
    if (this.flushInterval > 0) {
      this.flushIntervalId = setInterval(() => this.flushEvaluations(), this.flushInterval);
    }

    this.initialized = true;
  }

  /**
   * Register a listener for when flags are updated.
   */
  onUpdate(callback: () => void) {
    this.onUpdateCallback = callback;
  }

  /**
   * Evaluates a feature flag locally using cached definitions.
   * Logs evaluation to the analytics queue.
   */
  evaluate(flagKey: string, userCtx: UserContext, fallbackValue: any): EvalResult {
    const cachedFlag = this.flags[flagKey];

    if (!cachedFlag) {
      // Flag not in cache, fallback
      return {
        variant: 'fallback',
        value: fallbackValue,
        reason: 'FALLBACK'
      };
    }

    // Construct a mock FlagDefinition to fit the evaluator's signature
    const mockFlagDef: any = {
      id: cachedFlag.id,
      projectId: '',
      key: cachedFlag.key,
      name: cachedFlag.name,
      type: cachedFlag.type,
      isKilled: cachedFlag.isKilled,
      variants: cachedFlag.variants,
      environments: {
        [this.environment]: {
          id: '',
          flagId: cachedFlag.id,
          environment: this.environment,
          enabled: cachedFlag.enabled,
          defaultVariant: cachedFlag.defaultVariant,
          rules: cachedFlag.rules,
          rolloutPercentage: cachedFlag.rolloutPercentage,
          rolloutWeights: cachedFlag.rolloutWeights
        }
      }
    };

    try {
      const result = evaluate(mockFlagDef, this.environment, userCtx);

      // Queue evaluation analytics
      this.queueEvaluation(flagKey, result.variant, userCtx.userId);

      return result;
    } catch (e) {
      console.error(`[SDK] Error during flag evaluation for ${flagKey}:`, e);
      return {
        variant: cachedFlag.defaultVariant || 'fallback',
        value: fallbackValue,
        reason: 'FALLBACK'
      };
    }
  }

  /**
   * Fetches latest flags from the API server.
   */
  private async bootstrap(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/sdk/bootstrap?envKey=${this.sdkKey}`);
      if (!response.ok) {
        throw new Error(`Bootstrap server responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      this.environment = data.environment;
      
      const newFlags: Record<string, CachedFlag> = {};
      for (const flag of data.flags) {
        newFlags[flag.key] = flag;
      }

      this.flags = newFlags;
      this.saveToStorage();

      if (this.onUpdateCallback) {
        this.onUpdateCallback();
      }
    } catch (e: any) {
      console.warn('[SDK] Failed to bootstrap flags. Using cached values.', e.message);
    }
  }

  /**
   * Subscribes to real-time Server-Sent Events.
   */
  private connectStream(): void {
    if (!this.eventSourceClass) {
      console.warn('[SDK] EventSource class not found. Real-time updates disabled.');
      return;
    }

    try {
      const url = `${this.baseUrl}/api/v1/sdk/stream?envKey=${this.sdkKey}`;
      this.eventSource = new this.eventSourceClass(url);

      this.eventSource.addEventListener('flag-update', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`[SDK] Real-time update signal received for flag: ${data.flagKey}`);
          this.bootstrap();
        } catch (e) {
          console.error('[SDK] Error parsing SSE payload:', e);
        }
      });

      this.eventSource.onerror = (e: any) => {
        console.warn('[SDK] SSE Connection disconnected or error. EventSource will auto-reconnect.', e);
      };
    } catch (e) {
      console.error('[SDK] Error connecting to SSE stream:', e);
    }
  }

  /**
   * Queues an evaluation event.
   */
  private queueEvaluation(flagKey: string, variantReturned: string, userId: string): void {
    this.evaluationQueue.push({
      flagKey,
      variantReturned,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Flushes the evaluation analytics queue to the API server.
   */
  private async flushEvaluations(): Promise<void> {
    if (this.evaluationQueue.length === 0) return;

    const toSend = [...this.evaluationQueue];
    this.evaluationQueue = []; // clear queue

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/sdk/evaluations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sdkKey: this.sdkKey,
          evaluations: toSend
        })
      });

      if (!response.ok) {
        throw new Error(`Logging failed: status ${response.status}`);
      }
    } catch (e: any) {
      console.warn('[SDK] Failed to upload evaluation logs. Re-queuing.', e.message);
      // Prepend back to queue to retry
      this.evaluationQueue = [...toSend, ...this.evaluationQueue];
    }
  }

  /**
   * Closes active intervals and connections.
   */
  destroy(): void {
    if (this.pollIntervalId) clearInterval(this.pollIntervalId);
    if (this.flushIntervalId) clearInterval(this.flushIntervalId);
    if (this.eventSource) this.eventSource.close();
    this.flushEvaluations();
  }

  // Caching utilities
  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`ff_sdk_${this.sdkKey}`, JSON.stringify({
          environment: this.environment,
          flags: this.flags
        }));
      }
    } catch (e) {
      // LocalStorage might be full/restricted
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem(`ff_sdk_${this.sdkKey}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.environment = parsed.environment;
          this.flags = parsed.flags;
          console.log('[SDK] Loaded cached flags from LocalStorage.');
        }
      }
    } catch (e) {
      // Ignore
    }
  }
}
