import { IWebhookRepository } from '../repositories/interfaces';

export class WebhookService {
  constructor(private webhookRepo: IWebhookRepository) {}

  /**
   * Asynchronously triggers all registered webhooks for a project.
   */
  async triggerWebhooks(
    projectId: string,
    payload: {
      event: 'flag.created' | 'flag.updated' | 'flag.deleted' | 'flag.toggled' | 'flag.killed';
      projectId: string;
      flagKey: string;
      environment?: 'dev' | 'staging' | 'prod';
      actor: string;
      timestamp: Date;
    }
  ): Promise<void> {
    try {
      const hooks = await this.webhookRepo.listWebhooks(projectId);
      const activeHooks = hooks.filter(h => h.enabled);

      if (activeHooks.length === 0) return;

      console.log(`[Webhook] Triggering ${activeHooks.length} webhook(s) for project ${projectId}.`);

      // Fire all webhooks concurrently in the background without blocking the main request
      for (const hook of activeHooks) {
        this.sendWebhook(hook.url, payload).catch(err => {
          console.error(`[Webhook] Failed to dispatch webhook to ${hook.url}:`, err.message);
        });
      }
    } catch (e) {
      console.error('[Webhook] Error fetching webhooks to trigger:', e);
    }
  }

  private async sendWebhook(url: string, payload: any): Promise<void> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'feature-flag-service-webhook-agent'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
  }
}
