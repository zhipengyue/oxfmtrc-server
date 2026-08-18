import { Controller, Get, Query } from '@nestjs/common';
import { MockDeviceStreamService } from './mock-device-stream.service';
import { MockapiService } from './mockapi.service';

@Controller('mockapi')
export class MockapiController {
  constructor(
    private readonly mockapiService: MockapiService,
    private readonly deviceStreamService: MockDeviceStreamService,
  ) {}

  /**
   * 表格分页数据（前端 Table 组件调试）
   * Query: page（默认 1）、pageSize（默认 10，最大 100）
   */
  @Get('table')
  getTable(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const size = pageSize ? parseInt(pageSize, 10) : 10;
    return this.mockapiService.getTable(
      Number.isFinite(p) ? p : 1,
      Number.isFinite(size) ? size : 10,
    );
  }

  /** 表格全量数据（不分页） */
  @Get('table/all')
  getTableAll() {
    return this.mockapiService.getTableAll();
  }

  /** 大屏 WebSocket 可调用的预置设备目录 */
  @Get('devices')
  getDevices() {
    return {
      list: this.deviceStreamService.getCatalog(),
      wsPath: '/mockapi/ws/device-stream',
    };
  }
}
