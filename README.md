# Feature Flag System with Gradual Rollout

An enterprise-grade, backend-first feature flag and targeting engine (similar to LaunchDarkly) built from scratch. It features sub-5ms evaluations, percentage rollouts, attribute-based targeting rules, real-time push updates via Server-Sent Events (SSE), and a modern React dashboard.

The system is designed with a **clean repository/provider pattern**. It uses in-memory database and pub/sub providers by default, but includes SQL schemas and Postgres/Redis repositories so switching to a production setup is simple.

---

## 🏗️ Project Architecture Layout

The codebase is organized into clean, decoupled modules:

1. **`shared/`**
   - Contains type definitions and the pure, deterministic targeting evaluation engine with MurmurHash v3 percentage rollout bucketing.
2. **`backend/`**
   - Node.js + Express + TypeScript API server.
   - Separate controllers, services, repositories, and authentication layers.
   - Includes PostgreSQL SQL schemas ([schema.sql](backend/schema.sql)), active SQL adapters, and in-memory mock repository fallbacks.
   - Real-time Server-Sent Events (SSE) broadcasting and Redis Pub/Sub caching.
3. **`sdk/`**
   - Reusable client SDK featuring LocalStorage caching, Server-Sent Events real-time sync, local engine evaluations, and background analytics batch reporting.
4. **`frontend/`**
   - A modern React (Vite + TypeScript) Single Page App dashboard built using **Vanilla CSS variables** (harmonious dark mode, glassmorphic elements, inline rule builder, and audit logs viewer).

---

## 🚀 Getting Started (Quick Start)

### 1. Spin Up the Backend API Server
By default, the server runs in **in-memory database and event mode** (no Docker/Postgres/Redis required to test).
```bash
cd backend
npm install
npm run dev
```

### 2. Run the Evaluator Unit Tests
Validate the pure evaluation logic (boolean flags, multivariate rule resolution order, custom operators, and MurmurHash rollout distribution):
```bash
cd backend
npm run test
```

### 3. Run the Client SDK Demo Integration
Simulates a live application using the client SDK, displaying local evaluations (standard vs premium users) and flushing analytics back to the server:
```bash
cd backend
npx ts-node ../sdk/demo-client.ts
```

### 4. Start the Admin Dashboard Console
Launch the Vite React console (runs on port `3000`):
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser:
* **Username:** `admin@example.com`
* **Password:** `admin123`

---

## ⚙️ Production Database & Cache Setup

To toggle from in-memory mode to **PostgreSQL** and **Redis**, spin up the services using Docker:
```bash
docker-compose up -d
```
Then, create a `.env` file in the `backend/` directory:
```env
DB_TYPE=postgres
CACHE_TYPE=redis
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/flagdb
REDIS_URL=redis://localhost:6379
JWT_SECRET=feature-flag-system-secret-key-999
PORT=3001
```
*(Make sure to run the SQL schema DDL inside `backend/schema.sql` on your PostgreSQL database first).*

---

## 🌟 Key Technical Details to Know

* **Deterministic Bucketing:** Rollouts use MurmurHash v3: `murmurhash.v3(userId + ':' + flagKey) % 100`. This ensures the same user always gets the same variant for a flag without storing mapping state in a database.
* **Emergency Kill Switch:** A top-level override switch bypasses rules immediately and serves the default fallback value in production during incidents.
* **Server-Sent Events (SSE):** Real-time push stream updates propagate configuration edits from the database to active client SDK instances in sub-second intervals without polling.
