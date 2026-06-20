# Code Walkthrough - Feature Flag Platform

We have successfully built a production-grade, backend-first feature flag and targeting platform from scratch. 

The architecture contains separated API, service, repository, and evaluation layers. It features standard in-memory fallbacks so you can run and test everything out-of-the-box without Docker, and toggle PostgreSQL/Redis later with a simple config.

---

## 🏗️ Project Architecture Layout

The codebase is organized into clean SDE modules:

1. **[shared/](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/shared)**
   - [types.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/shared/types.ts): Typings for Flags, Variants, Environments, Rules, UserContext, AuditLogs, and Evaluations.
   - [evaluator.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/shared/evaluator.ts): The pure, deterministic targeting evaluation engine + MurmurHash v3 percentage bucketing.
2. **[backend/](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend)**
   - [schema.sql](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/schema.sql): Full PostgreSQL DDL schemas for durable database initialization.
   - [src/repositories/](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/repositories/): Abstraction layer separating interfaces ([interfaces.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/repositories/interfaces.ts)), in-memory DB mocks ([memory-repo.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/repositories/memory-repo.ts)), and active SQL adapters ([postgres-repo.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/repositories/postgres-repo.ts)).
   - [src/services/](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/services/): Event publishers ([pubsub.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/services/pubsub.ts)) supporting Redis Pub/Sub vs memory event emitters, and background hook triggers ([webhook.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/services/webhook.ts)).
   - [src/controllers/](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/controllers/): Rest handlers for flag operations ([flag.controller.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/controllers/flag.controller.ts)), admin credentials ([auth.controller.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/controllers/auth.controller.ts)), and client SDK actions ([sdk.controller.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/src/controllers/sdk.controller.ts)) including real-time Server-Sent Events (SSE).
3. **[sdk/](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/sdk)**
   - [sdk.ts](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/sdk/sdk.ts): Reusable feature-flag client with LocalStorage caching, Server-Sent Events real-time sync, local engine evaluator, and background analytics batch reporting.
4. **[frontend/](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/frontend)**
   - A modern React Vite Single Page App dashboard built using **Vanilla CSS variables** for premium dark modes, glassmorphic card elements, inline modal managers, rule priorities editor, and audit logs.

---

## 🚀 Execution & Running Instructions

### 1. Start the Backend API Server
First, run the backend API server. In-memory mode is enabled by default.
```bash
cd backend
npm run dev
```

### 2. Run the Evaluator Unit Tests
Validate the pure evaluation engine (boolean flags, multivariate rule resolution order, operators, and murmurhash rollout distributions):
```bash
cd backend
npm run test
```

### 3. Run the Client SDK Demo Integration
Simulates a live application using the client SDK client, displaying local evaluations (premium vs standard users) and flushing analytics back to the server:
```bash
cd backend
npx ts-node ../sdk/demo-client.ts
```

### 4. Start the Admin Dashboard Console
Launch the Vite server on port 3000:
```bash
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
- **Login Username**: `admin@example.com`
- **Login Password**: `admin123`

---

## 🛡️ Database & Cache Switching

To run the platform using PostgreSQL and Redis instead of in-memory, create a `.env` file in the `backend/` directory:
```env
DB_TYPE=postgres
CACHE_TYPE=redis
DATABASE_URL=postgresql://user:password@localhost:5432/flagdb
REDIS_URL=redis://localhost:6379
JWT_SECRET=feature-flag-system-secret-key-999
PORT=3001
```
Use the SQL schema DDL inside [schema.sql](file:///c:/Users/Dell/Downloads/koding%20repos/feature-flag-system/backend/schema.sql) to set up tables on your PostgreSQL database first.
