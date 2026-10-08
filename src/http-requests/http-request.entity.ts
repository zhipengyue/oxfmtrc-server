import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import {
  HttpMethod,
  HttpRequestStatus,
  HttpRequestType,
  MqttMode,
  WsMode,
} from './http-request.enums';

/** 项目下外部 HTTP / 数据源请求配置 */
@Entity('app_http_requests')
@Unique(['appId', 'name'])
export class AppHttpRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  appId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 2000 })
  address: string;

  @Column({ type: 'enum', enum: HttpRequestType, default: HttpRequestType.HTTP })
  type: HttpRequestType;

  @Column({ type: 'enum', enum: HttpMethod, nullable: true })
  method: HttpMethod | null;

  @Column({ type: 'enum', enum: MqttMode, nullable: true })
  mqttMode: MqttMode | null;

  @Column({ type: 'enum', enum: WsMode, nullable: true })
  wsMode: WsMode | null;

  @Column({ type: 'int', default: 5000 })
  frequencyMs: number;

  @Column({ type: 'boolean', default: true })
  autoRequest: boolean;

  @Column({
    type: 'enum',
    enum: HttpRequestStatus,
    default: HttpRequestStatus.ENABLED,
  })
  status: HttpRequestStatus;

  /** MySQL TEXT 列不能设 DEFAULT，空值由 Service 写入 */
  @Column({ type: 'text' })
  paramsFn: string;

  @Column({ type: 'text' })
  headersFn: string;

  @Column({ type: 'text' })
  responseFn: string;

  @Column({ type: 'text' })
  configText: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
