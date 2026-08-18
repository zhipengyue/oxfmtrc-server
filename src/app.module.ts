import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { RefreshToken } from './auth/refresh-token.entity';
import { CategoriesModule } from './categories/categories.module';
import { Category } from './categories/category.entity';
import { AppHttpRequest } from './http-requests/http-request.entity';
import { HttpRequestsModule } from './http-requests/http-requests.module';
import { LowcodeApp } from './lowcode/lowcode-app.entity';
import { LowcodePage } from './lowcode/lowcode-page.entity';
import { LowcodeAppsModule } from './lowcode/lowcode-apps.module';
import { MaterialCategoriesModule } from './material-categories/material-categories.module';
import { MaterialCategory } from './material-categories/material-category.entity';
import { MockapiModule } from './mockapi/mockapi.module';
import { StorageModule } from './storage/storage.module';
import { User } from './users/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: parseInt(config.get<string>('DB_PORT', '3306'), 10),
        username: config.get<string>('DB_USERNAME', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'oxfmtrc'),
        entities: [
          User,
          LowcodeApp,
          LowcodePage,
          Category,
          MaterialCategory,
          RefreshToken,
          AppHttpRequest,
        ],
        synchronize: process.env.NODE_ENV !== 'production',
        logging: process.env.DB_LOGGING === 'true',
      }),
    }),
    AuthModule,
    LowcodeAppsModule,
    CategoriesModule,
    MockapiModule,
    HttpRequestsModule,
    StorageModule,
    MaterialCategoriesModule,
  ],
})
export class AppModule {}
