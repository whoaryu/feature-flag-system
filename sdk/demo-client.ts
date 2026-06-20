import { FeatureFlagClient } from './sdk';

async function runDemo() {
  console.log('=========================================');
  console.log('  STARTING CLIENT SDK DEMO SIMULATION    ');
  console.log('=========================================');

  // Initialize SDK with the default dev key bootstrapped in memory repository
  const sdkKey = 'sdk_dev_default_key_123';
  const client = new FeatureFlagClient(sdkKey, {
    baseUrl: 'http://localhost:3001',
    flushInterval: 2000, // Flush evaluations every 2 seconds
    enableStream: false  // Disable SSE for simple command line demo to avoid hanging
  });

  // Fetch flags
  console.log('[Demo] Bootstrapping client SDK...');
  await client.initialize();
  console.log('[Demo] Client SDK initialized successfully.');

  // Set up listeners for updates
  client.onUpdate(() => {
    console.log('[Demo] Notification: Flags updated on server! Refetched latest cache.');
  });

  // User Context 1: Premium user (should match rule: plan === premium -> true)
  const premiumUser = {
    userId: 'user-premium-101',
    email: 'alice@acme.com',
    plan: 'premium',
    country: 'US'
  };

  // User Context 2: Standard user (should NOT match rule, falls back to default variant -> false)
  const standardUser = {
    userId: 'user-standard-202',
    email: 'bob@gmail.com',
    plan: 'free',
    country: 'CA'
  };

  // User Context 3: Staging user (let's check rollout)
  const usersForRollout = Array.from({ length: 5 }, (_, i) => ({
    userId: `user-rollout-id-${i}`,
    email: `user${i}@test.com`
  }));

  console.log('\n--- Evaluating "show-new-dashboard" flag ---');

  const flagKey = 'show-new-dashboard';

  // Evaluate premium
  const resPremium = client.evaluate(flagKey, premiumUser, false);
  console.log(`User Alice (Premium): Returned variant=${resPremium.variant}, value=${resPremium.value} (Reason: ${resPremium.reason})`);

  // Evaluate standard
  const resStandard = client.evaluate(flagKey, standardUser, false);
  console.log(`User Bob (Free): Returned variant=${resStandard.variant}, value=${resStandard.value} (Reason: ${resStandard.reason})`);

  console.log('\n--- Evaluating Rollout Bucketing for multiple users ---');
  usersForRollout.forEach(user => {
    const res = client.evaluate(flagKey, user, false);
    console.log(`User ${user.userId}: Returned variant=${res.variant}, value=${res.value} (Reason: ${res.reason})`);
  });

  // Let the queue flush evaluations asynchronously to the server
  console.log('\n[Demo] Waiting for evaluation events to flush to backend server...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Destroy client (flushes final events and stops timers)
  client.destroy();
  console.log('[Demo] Cleaned up SDK client. Demo complete.');
  console.log('=========================================');
}

runDemo().catch(err => {
  console.error('[Demo] Error running simulation:', err);
});
