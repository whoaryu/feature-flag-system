# NPM Package & Deployment Guide

This guide covers how developers install and configure the packaged SDK, how SDK keys are generated/managed, and how to deploy the feature flag system (Backend and Frontend) so other developers/users can access it from their own machines.

---

## 1. Using the SDK NPM Package

Once you publish the package to `npmjs.com`, anyone can install it in their project:

```bash
npm install feature-flag-client-sdk
```

### Integration Example
Here is how developers initialize and use it in a JavaScript/TypeScript application:

```typescript
import { FeatureFlagClient } from 'feature-flag-client-sdk';

// 1. Initialize the client
const ffs = new FeatureFlagClient('sdk_prod_your_key_123', {
  baseUrl: 'https://your-feature-flag-api.com', // Your deployed backend API
  enableStream: true, // Receive instant real-time changes via Server-Sent Events (SSE)
});

// 2. Fetch flag definitions & connect stream
await ffs.initialize();

// 3. Define the current user context
const user = {
  userId: 'user-id-54321',
  email: 'client@company.com',
  plan: 'premium',
  country: 'US'
};

// 4. Perform instant, local evaluation (<1ms)
const decision = ffs.evaluate('new-ui-theme', user, 'default-light');

console.log(`Serve theme: ${decision.value} (Reason: ${decision.reason})`);
```

---

## 2. How to Get the SDK Key & How it Connects

### How to Get the SDK Key
1. Open your **Feature Flag Dashboard**.
2. Select or create a **Project**.
3. Under the **Environments** settings, you will see your environments (e.g., `Development`, `Staging`, `Production`).
4. Each environment has a unique, automatically generated **SDK Key** (e.g., `sdk_dev_default_key_123`). Copy this key to initialize the client.

### How they Connect (Under the Hood)
1. **Bootstrap**: The SDK sends a `GET /api/v1/sdk/bootstrap?envKey=YOUR_SDK_KEY` request to your backend to pull all flag definitions for that environment.
2. **Stream**: The SDK opens a persistent `GET /api/v1/sdk/stream?envKey=YOUR_SDK_KEY` SSE (Server-Sent Events) connection. The backend uses this to broadcast a message when a flag is edited.
3. **Local Engine**: When `ffs.evaluate()` is called, no API call is made. The SDK evaluates the rules locally using the cached definitions, making evaluations instant.
4. **Analytics**: The SDK batches metrics and sends them via `POST /api/v1/sdk/evaluations` every few seconds to feed the dashboard charts.

---

## 3. How to Deploy the Backend & Frontend for Global Access

Since everything currently runs on `localhost`, you need to deploy them to public servers so developers can use your SDK from their laptops.

### Option A: Tunneling via Ngrok (Fastest for Demos)
If you want to demo it instantly from your laptop without deploying code to the cloud:
1. Download [Ngrok](https://ngrok.com/).
2. Run ngrok to expose your backend port:
   ```bash
   ngrok http 3001
   ```
3. Ngrok will give you a public URL (e.g., `https://a5b4-103.xxx.xxx.ngrok-free.app`). 
4. Pass this public URL as the `baseUrl` in the SDK constructor.

---

### Option B: Cloud Hosting (Production Setup)

To make it permanently available, deploy the dashboard, backend, and database.

#### 1. The Database (Control Plane State)
* **PostgreSQL (Database)**: Use a free managed database service like **Supabase** or **Aiven**.
* Obtain the connection string (`DATABASE_URL`).
* *(Note: Redis is not required since the system runs on a single backend instance using the built-in memory event bus.)*

#### 2. Deploying the Backend API (Express Server)
* **Hosting Platforms**: Deploy to **Render**, **Railway**, or **Fly.io** (which all support Node.js/Docker deployments).
* **Setup Environment Variables**:
  * Set `DB_TYPE=postgres`
  * Set `CACHE_TYPE=memory`
  * Set `DATABASE_URL=your-supabase-postgres-url`
  * Set `JWT_SECRET=your-secure-secret-key`
  * Set `PORT=3000` (or whatever the host exposes)

#### 3. Deploying the Frontend Dashboard (React/Vite app)
* **Hosting Platforms**: Deploy to **Vercel** or **Netlify**.
* **Configuration**:
  * Set the environment variable `VITE_API_URL` to point to your deployed backend URL.
  * Run the build command (`npm run build`) and point the publish directory to `dist/`.
