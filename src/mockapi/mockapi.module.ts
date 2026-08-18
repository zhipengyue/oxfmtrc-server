import { Module } from '@nestjs/common';
import { MockDeviceStreamService } from './mock-device-stream.service';
import { MockDeviceWsServer } from './mock-device-ws.server';
import { MockapiController } from './mockapi.controller';
import { MockapiService } from './mockapi.service';

@Module({
  controllers: [MockapiController],
  providers: [MockapiService, MockDeviceStreamService, MockDeviceWsServer],
})
export class MockapiModule {}
