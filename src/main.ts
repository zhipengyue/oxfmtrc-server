import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MockDeviceWsServer } from './mockapi/mock-device-ws.server';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  const port = process.env.PORT ?? 3005;
  await app.listen(port);
  app.get(MockDeviceWsServer).attach(app.getHttpServer());
}
bootstrap();
