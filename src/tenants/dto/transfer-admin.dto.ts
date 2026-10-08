import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class TransferAdminDto {
  @IsString({ message: '请选择接收管理员的成员' })
  @IsNotEmpty({ message: '请选择接收管理员的成员' })
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { message: '成员无效' },
  )
  memberId: string;
}
