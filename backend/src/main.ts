import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Keep rawBody for Chapa webhook HMAC verification
    rawBody: true,
  });

  // Trust Cloudflare / load-balancer headers so rate limiting sees real client IPs
  app.set('trust proxy', 1);

  // Security headers (XSS, clickjacking, MIME sniffing, etc.)
  app.use(
    helmet({
      contentSecurityPolicy: false, // API-only server; CSP belongs to the frontend
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // product banners load cross-origin
    }),
  );

  // gzip responses — catalog JSON shrinks ~70%
  app.use(compression());

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Graceful shutdown: finish in-flight requests + let queues drain on SIGTERM
  app.enableShutdownHooks();

  // Bot/worker-only process (PM2 kv-bot) serves no HTTP
  if ((process.env.DISABLE_HTTP || 'false') === 'true') {
    await app.init();
    console.log('Backend started in WORKER mode (no HTTP listener).');
    return;
  }

  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`Backend server running on port ${port}`);
}
bootstrap();
