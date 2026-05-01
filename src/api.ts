import app from './app';
import { env } from './config/env';
import { connectMongo } from './db/mongo';

const PORT = env.PORT || 3000;

if (require.main === module) {
  connectMongo().then(() => {
    const server = app.listen(PORT, () => {
      console.log(`API running on port ${PORT}`);
      if (process.env.DEV_EXIT_AFTER_START === 'true') {
        server.close(() => process.exit(0));
      }
    });
  });
}
