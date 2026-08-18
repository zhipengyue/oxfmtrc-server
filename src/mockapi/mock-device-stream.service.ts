import { Injectable } from '@nestjs/common';
import {
  MOCK_DEVICE_METRICS,
  MockDeviceCatalogItem,
  MockDeviceMetric,
  MockDeviceStatus,
  MockDeviceTelemetryItem,
} from './mock-device.types';

const DEVICE_CATALOG: MockDeviceCatalogItem[] = [
  {
    deviceId: 'dev-001',
    deviceName: '1号温湿度传感器',
    location: 'A区-机房',
    type: 'sensor',
  },
  {
    deviceId: 'dev-002',
    deviceName: '2号温湿度传感器',
    location: 'B区-车间',
    type: 'sensor',
  },
  {
    deviceId: 'dev-003',
    deviceName: '3号电表',
    location: 'A区-配电室',
    type: 'meter',
  },
  {
    deviceId: 'dev-004',
    deviceName: '4号压力变送器',
    location: 'C区-管道',
    type: 'transmitter',
  },
  {
    deviceId: 'dev-005',
    deviceName: '5号CO₂探测器',
    location: 'D区-展厅',
    type: 'detector',
  },
  {
    deviceId: 'dev-006',
    deviceName: '6号综合采集器',
    location: 'E区-中控',
    type: 'gateway',
  },
  {
    deviceId: 'dev-007',
    deviceName: '7号温湿度传感器',
    location: 'F区-仓库',
    type: 'sensor',
  },
  {
    deviceId: 'dev-008',
    deviceName: '8号备用采集点',
    location: 'G区-备用',
    type: 'sensor',
  },
];

@Injectable()
export class MockDeviceStreamService {
  getCatalog(): MockDeviceCatalogItem[] {
    return DEVICE_CATALOG;
  }

  getAllowedDeviceIds(): string[] {
    return DEVICE_CATALOG.map((d) => d.deviceId);
  }

  resolveMetrics(input?: MockDeviceMetric[]): MockDeviceMetric[] {
    if (!input?.length) {
      return [...MOCK_DEVICE_METRICS];
    }
    return input.filter((m) =>
      MOCK_DEVICE_METRICS.includes(m),
    ) as MockDeviceMetric[];
  }

  buildTelemetry(
    deviceIds: string[],
    metrics: MockDeviceMetric[],
  ): MockDeviceTelemetryItem[] {
    const catalog = new Map(DEVICE_CATALOG.map((d) => [d.deviceId, d]));
    return deviceIds.map((deviceId) => {
      const meta = catalog.get(deviceId)!;
      const online = deviceId !== 'dev-008' || Math.random() > 0.15;
      const status = this.randomStatus(online);
      const values: Partial<Record<MockDeviceMetric, number | string>> = {};
      for (const key of metrics) {
        if (key === 'status') {
          values.status = status;
        } else {
          values[key] = this.randomMetric(key, status);
        }
      }
      return {
        deviceId,
        deviceName: meta.deviceName,
        online,
        metrics: values,
      };
    });
  }

  private randomStatus(online: boolean): MockDeviceStatus {
    if (!online) return 'offline';
    const r = Math.random();
    if (r > 0.92) return 'alarm';
    if (r > 0.78) return 'warning';
    return 'normal';
  }

  private randomMetric(
    key: MockDeviceMetric,
    status: MockDeviceStatus,
  ): number {
    const factor = status === 'alarm' ? 1.25 : status === 'warning' ? 1.1 : 1;
    switch (key) {
      case 'temperature':
        return Math.round((22 + Math.random() * 12) * factor * 10) / 10;
      case 'humidity':
        return Math.round((40 + Math.random() * 40) * 10) / 10;
      case 'power':
        return Math.round((50 + Math.random() * 200) * factor * 10) / 10;
      case 'voltage':
        return Math.round((218 + Math.random() * 10) * 10) / 10;
      case 'pressure':
        return Math.round((0.8 + Math.random() * 0.6) * factor * 100) / 100;
      case 'co2':
        return Math.round(400 + Math.random() * 800 * factor);
      default:
        return 0;
    }
  }
}
