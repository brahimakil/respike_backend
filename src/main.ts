import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS
  app.enableCors({
    origin: [
      'http://localhost:5173', // Admin panel (local)
      'http://localhost:5174', // User panel (local)
      'http://localhost:5175', // Additional port if needed
       // Admin panel (production)
      'https://respike-backend.vercel.app', // Backend (production)
    ],
    credentials: true,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  console.log(`🚀 Server is running on: http://localhost:${port}`);
}
bootstrap();
