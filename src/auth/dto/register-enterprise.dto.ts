import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

const CN_PHONE = /^1[3-9]\d{9}$/;

export class RegisterEnterpriseDto {
  @IsString()
  @IsNotEmpty({ message: '企业名称不能为空' })
  @Length(1, 200)
  companyName: string;

  @IsString()
  @IsNotEmpty({ message: '管理员手机号不能为空' })
  @Matches(CN_PHONE, { message: '请输入有效的手机号' })
  adminPhone: string;

  @IsString()
  @Length(6, 64, { message: '密码长度为 6–64 位' })
  password: string;
}
