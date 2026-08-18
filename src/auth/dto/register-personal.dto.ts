import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/** 中国大陆手机号 */
const CN_PHONE = /^1[3-9]\d{9}$/;

export class RegisterPersonalDto {
  @IsString()
  @IsNotEmpty({ message: '手机号不能为空' })
  @Matches(CN_PHONE, { message: '请输入有效的手机号' })
  phone: string;

  @IsString()
  @Length(6, 64, { message: '密码长度为 6–64 位' })
  password: string;
}
