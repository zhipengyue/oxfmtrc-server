import { BadRequestException } from '@nestjs/common';

/** 前端 public/avatars 下的默认头像 */
export const DEFAULT_AVATAR_URL = '/avatars/preset-01.svg';

const PRESET_RE = /^\/avatars\/preset-(0[1-9]|1[0-2])\.svg$/;
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
/** 压缩后的自定义头像上限（约 220KB 字符） */
const MAX_DATA_URL_LENGTH = 300_000;

/**
 * 规范化头像：空值 → 默认预设；仅允许预设路径或图片 data URL。
 */
export function normalizeAvatarUrl(raw: unknown): string {
  if (raw == null) return DEFAULT_AVATAR_URL;
  const value = String(raw).trim();
  if (!value) return DEFAULT_AVATAR_URL;
  if (PRESET_RE.test(value)) return value;
  if (value.startsWith('data:image/')) {
    if (value.length > MAX_DATA_URL_LENGTH) {
      throw new BadRequestException('头像图片过大，请压缩后重试');
    }
    if (!DATA_IMAGE_RE.test(value.replace(/\s/g, ''))) {
      throw new BadRequestException('头像格式无效');
    }
    return value.replace(/\s/g, '');
  }
  // 已上传的公开资源路径 / URL（企业成员创建后走存储）
  if (
    value.startsWith('/visual-assets/') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    if (value.length > 1024) throw new BadRequestException('头像地址无效');
    return value;
  }
  throw new BadRequestException('头像无效，请选择默认头像或上传图片');
}
