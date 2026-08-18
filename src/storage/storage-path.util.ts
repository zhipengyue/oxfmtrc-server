/** MinIO 对象路径：visual-assets bucket 下按用户与素材分类组织 */
export function safeOwnerAccount(ownerAccount: string): string {
  return ownerAccount.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function slugifyMaterialCategory(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (base.length >= 2) return base.slice(0, 48);
  return `category-${Date.now().toString(36)}`;
}

export function materialCategoryPrefix(
  ownerAccount: string,
  slug: string,
): string {
  return `uploads/${safeOwnerAccount(ownerAccount)}/${slug}/`;
}

export const MATERIAL_CATEGORY_KEEP_FILE = '.keep';
