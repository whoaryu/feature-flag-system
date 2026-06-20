import dotenv from 'dotenv';
import app from './app';
import { initializeRepositories } from './repositories';
import { getPubSubService } from './services/pubsub';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    // 1. Initialize repositories (Memory or Postgres)
    await initializeRepositories();

    // 2. Initialize Pub/Sub service (Memory or Redis)
    const pubSub = getPubSubService();
    await pubSub.initialize();

    // 3. Start Express server
    const server = app.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(`  FEATURE FLAG SERVICE IS LIVE           `);
      console.log(`  Port: http://localhost:${PORT}        `);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  DB Type: ${process.env.DB_TYPE || 'memory'} `);
      console.log(`  Cache Type: ${process.env.CACHE_TYPE || 'memory'} `);
      console.log(`=========================================`);
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down server gracefully...');
      server.close(async () => {
        try {
          await pubSub.close();
          console.log('Server and pub/sub closed.');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start Feature Flag Service:', error);
    process.exit(1);
  }
}

bootstrap();
