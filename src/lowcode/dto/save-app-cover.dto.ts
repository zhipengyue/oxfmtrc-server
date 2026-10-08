import { IsString, MaxLength, Matches } from 'class-validator';

export class SaveAppCoverDto {
  @IsString()
  @MaxLength(1_000_000)
  @Matches(/^data:image\/(?:jpeg|png|webp);base64,/, {
    message: 'coverDataUrl 必须是有效的图片数据',
  })
  coverDataUrl: string;
}
