/**
 * 錯誤訊息：把 services 的錯誤代碼轉成老闆看得懂的中文。
 */
import type { ActionErrorCode, BootstrapError } from '../../services';

/** 啟動失敗，或啟動過程拋出未預期的錯誤 */
export type StartupError = BootstrapError | { code: 'unexpected'; message: string };

export interface ErrorScreenText {
  title: string;
  /** 主要說明（一般人看得懂） */
  body: string;
  /** 資料有沒有事 */
  dataNote: string;
  /** 建議下一步 */
  nextStep: string;
  /** 技術細節（摺疊顯示，回報問題用） */
  details: string[];
}

const CONTACT = '請截圖這個畫面傳給開發者。';

export function describeStartupError(error: StartupError): ErrorScreenText {
  switch (error.code) {
    case 'balance_invalid':
      return {
        title: '遊戲數值設定檔有問題',
        body: '這一版 App 內建的數值設定檔格式不正確，為了不算錯金幣、經驗和 HP，App 先停在這裡。',
        dataNote: '這是程式版本的問題，你的冒險紀錄沒有被修改。',
        nextStep: `等開發者修正後更新 App 即可。${CONTACT}`,
        details: [
          `錯誤代碼：balance_invalid`,
          error.message,
          ...error.issues.map((i) => `${i.path}：${i.message}`),
        ],
      };
    case 'content_missing':
      return {
        title: '找不到遊戲內容資料',
        body: '這一版 App 缺少職業或習慣的內容資料，無法開始。',
        dataNote: '這是程式版本的問題，你的冒險紀錄沒有被修改。',
        nextStep: `等開發者修正後更新 App 即可。${CONTACT}`,
        details: [`錯誤代碼：content_missing`, error.message, ...error.missing],
      };
    case 'content_invalid':
      return {
        title: '遊戲內容資料有問題',
        body: '這一版 App 內建的職業或習慣資料格式不正確，無法開始。',
        dataNote: '這是程式版本的問題，你的冒險紀錄沒有被修改。',
        nextStep: `等開發者修正後更新 App 即可。${CONTACT}`,
        details: [`錯誤代碼：content_invalid`, error.message, ...error.issues],
      };
    case 'storage_failed':
      return {
        title: '讀不到這台手機上的冒險紀錄',
        body: '開啟本機資料時發生錯誤（可能是空間不足、無痕模式，或資料升級失敗）。',
        dataNote:
          error.snapshotId === null
            ? 'App 沒有刪除任何資料。'
            : `App 沒有刪除任何資料，升級前已自動備份（備份編號 ${error.snapshotId}）。`,
        nextStep: `請先完全關閉 App 再開一次；仍然失敗時，${CONTACT}`,
        details: [
          `錯誤代碼：storage_failed${error.storageCode === null ? '' : `／${error.storageCode}`}`,
          error.message,
        ],
      };
    case 'unexpected':
      return {
        title: 'App 啟動時發生錯誤',
        body: '啟動過程遇到沒有預期的錯誤。',
        dataNote: 'App 沒有刪除任何資料。',
        nextStep: `請先完全關閉 App 再開一次；仍然失敗時，${CONTACT}`,
        details: ['錯誤代碼：unexpected', error.message],
      };
  }
}

const ACTION_ERROR_TEXT: Partial<Record<ActionErrorCode, string>> = {
  not_initialized: '還沒有選職業。',
  task_deleted: '這個項目已經刪除了。',
  reward_deleted: '這個獎勵已經刪除了。',
  mini_not_available: '這個項目沒有迷你版。',
  already_checked: '今天已經打過勾了。',
  already_completed: '這個委託已經完成了。',
  habit_up_not_allowed: '這個修行不能按「＋」。',
  habit_down_not_allowed: '這個修行不能按「－」。',
  insufficient_gold: '金幣不夠。',
  nothing_to_revert: '沒有可以取消的紀錄。',
  day_already_settled: '這一天已經結算，不能取消。',
  negative_gold_not_allowed: '取消後金幣會變成負數，不能取消。',
  checklist_item_not_found: '找不到這個檢查清單項目。',
  not_found: '找不到這個項目，畫面已重新整理。',
  wrong_task_type: '項目類型不符，畫面已重新整理。',
  conflict: '資料剛被另一個視窗改過，畫面已重新整理，請再試一次。',
  already_onboarded: '已經選過職業了。',
};

export function actionErrorText(code: ActionErrorCode, message?: string): string {
  if (code === 'invalid_input') return message ?? '輸入的內容不正確。';
  return ACTION_ERROR_TEXT[code] ?? `操作失敗（${code}）。`;
}
