

Here is the complete end-to-end testing flow to verify everything is working perfectly, from dashboard configuration to live SDK evaluation.

---

### Step 1: Log in to your Admin Dashboard
1. Open your deployed **Vercel Frontend URL** in your browser.
2. Since you have a fresh Neon database, you have two options:
   * **Sign Up**: Click on **Sign Up** to create a fresh administrator account with your own email and password.
   * **Default Admin**: Or log in using the pre-seeded credentials:
     * **Email**: `admin@example.com`
     * **Password**: `admin123`
3. Once logged in, you will see the main console dashboard.

---

### Step 2: Initialize Demo Flags & Rules
Your React app has a built-in playground simulator designed to test rules instantly.
1. Click on the **Simulator** tab in the sidebar navigation.
2. Since it's a fresh database, click the **"Setup Simulator Demo Flags"** button.
3. This will create and configure 4 demo feature flags with targeting rules automatically:
   * `show-beta-banner` (Targeting rule: `plan === premium` -> `true`)
   * `pricing-discount-tier` (Targeting rules: `plan === enterprise` -> `vip`, `country === US` -> `standard`)
   * `new-checkout-flow` (Targeting rule: `plan === premium` -> `v2-modern`)
   * `dark-mode-preview` (50% / 50% gradual percentage rollout)

---

### Step 3: Test Rules in the Dashboard Simulator
In the **Simulator Playground** view, you can change your simulated user attributes on the fly and see how rules evaluate instantly:
1. Under **User Attributes**, change the **Plan** from `free` to `premium`.
2. Notice the evaluation log on the right side of the simulator: `show-beta-banner` will instantly update from `false` to `true`.
3. Change **Country** to `US` and watch `pricing-discount-tier` evaluate to `standard`.
4. Modify the **User ID** text fields (e.g. `user-1`, `user-2`, `user-3`) and watch `dark-mode-preview` toggle between `true` and `false` based on the deterministic MurmurHash rollout calculation.

---

### Step 4: Test Your Published NPM SDK (Live Script)
To verify that outside clients can consume your SDK package, let's create a local script on your computer that pulls configuration from your live Render server.

1. Create a new temporary folder on your computer and initialize a project:
   ```bash
   mkdir sdk-live-test
   cd sdk-live-test
   npm init -y
   ```
2. Install your newly published SDK package:
   ```bash
   npm install feature-flag-client-sdk
   ```
3. Create a test file `test-live.js` and paste the following code:
   ```javascript
   const { FeatureFlagClient } = require('feature-flag-client-sdk');

   async function run() {
     // 1. Paste an SDK Key from the Settings tab in your dashboard
     const SDK_KEY = 'sdk_dev_default_key_123'; 
     
     // 2. Point it to your live Render backend
     const client = new FeatureFlagClient(SDK_KEY, {
       baseUrl: 'https://feature-flag-system-gszd.onrender.com',
       enableStream: true, // Connect to live Server-Sent Events (SSE) stream
     });

     console.log('Connecting to Feature Flag Server...');
     await client.initialize();
     console.log('Connected!');

     // 3. Listen to changes in real-time
     client.onUpdate(() => {
       console.log('\n[Event Received] Flags updated on dashboard! Re-evaluating...');
       evaluateFlags(client);
     });

     evaluateFlags(client);

     // Keep the process alive to listen for updates
     console.log('\nListening for changes on the dashboard... (Press Ctrl+C to exit)');
   }

   function evaluateFlags(client) {
     const premiumUser = { userId: 'user-premium-101', plan: 'premium' };
     const freeUser = { userId: 'user-standard-202', plan: 'free' };

     const resPremium = client.evaluate('show-beta-banner', premiumUser, false);
     const resFree = client.evaluate('show-beta-banner', freeUser, false);

     console.log(`- Alice (Premium Plan): show-beta-banner = ${resPremium.value} (Reason: ${resPremium.reason})`);
     console.log(`- Bob (Free Plan): show-beta-banner = ${resFree.value} (Reason: ${resFree.reason})`);
   }

   run().catch(console.error);
   ```
4. Run the script:
   ```bash
   node test-live.js
   ```
5. **Test Real-Time Streaming**: Keep the script running in your terminal. Go to your **Vercel Dashboard UI**, toggle the `show-beta-banner` flag status or edit its rules, and click **Save**. 
6. Watch your terminal—it will instantly display the updated values in real time without restarting!