/**
 * 命名規範檢查（CLAUDE.md「命名規範差異」）：
 * 資料欄位 camelCase；資料包 id 與 item id snake_case。
 */

export const SNAKE_CASE_ID_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
export const CAMEL_CASE_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export function isSnakeCaseId(value: string): boolean {
  return SNAKE_CASE_ID_PATTERN.test(value);
}

export function isCamelCaseKey(value: string): boolean {
  return CAMEL_CASE_KEY_PATTERN.test(value);
}

/**
 * 遞迴檢查 JSON 值裡**所有物件欄位名稱**是否為 camelCase。
 * 回傳違規欄位的路徑（例如 `items.0.task_template_ids`）；全部合法時回傳空陣列。
 */
export function findNonCamelCaseKeys(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findNonCamelCaseKeys(item, [...path, String(index)]));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => {
      const childPath = [...path, key];
      const own = isCamelCaseKey(key) ? [] : [childPath.join('.')];
      return [...own, ...findNonCamelCaseKeys(child, childPath)];
    });
  }
  return [];
}
