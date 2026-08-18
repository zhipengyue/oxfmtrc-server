import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  HttpMethod,
  HttpRequestStatus,
  HttpRequestType,
  MqttMode,
  WsMode,
} from '../http-request.enums';

const DEFAULT_RESPONSE_FN = '(res) => { return res.data }';

export class CreateHttpRequestDto {
  @IsString()
  @IsNotEmpty({ message: '名称不能为空' })
  @Length(1, 200)
  name: string;

  @IsString()
  @IsNotEmpty({ message: '地址不能为空' })
  @Length(1, 2000)
  address: string;

  @IsEnum(HttpRequestType, {
    message: '类型须为 http / mqtt / websocket / db',
  })
  type: HttpRequestType;

  @ValidateIf((o: CreateHttpRequestDto) => o.type === HttpRequestType.HTTP)
  @IsEnum(HttpMethod, { message: 'HTTP 方法须为 get / post / put / delete' })
  method?: HttpMethod;

  @ValidateIf((o: CreateHttpRequestDto) => o.type === HttpRequestType.MQTT)
  @IsEnum(MqttMode, { message: 'MQTT 类型须为 subscribe / publish' })
  mqttMode?: MqttMode;

  @ValidateIf((o: CreateHttpRequestDto) => o.type === HttpRequestType.WEBSOCKET)
  @IsEnum(WsMode, { message: 'WebSocket 类型须为 receive / send' })
  wsMode?: WsMode;

  @IsInt()
  @Min(0)
  frequencyMs: number;

  /** 启用 enabled / 禁用 disabled；不传时默认 enabled */
  @IsOptional()
  @IsEnum(HttpRequestStatus, { message: '状态须为 enabled（启用）或 disabled（禁用）' })
  status?: HttpRequestStatus;

  @IsOptional()
  @IsString()
  paramsFn?: string;

  @IsOptional()
  @IsString()
  headersFn?: string;

  @IsOptional()
  @IsString()
  responseFn?: string;

  @IsOptional()
  @IsString()
  configText?: string;
}

export class UpdateHttpRequestDto extends CreateHttpRequestDto {}

export { DEFAULT_RESPONSE_FN };
