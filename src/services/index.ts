/**
 * services 公開介面（architecture.md 第 5 節：ui → services → core；services → storage）。
 * UI 只從這裡 import，不直接碰 `idb` 或 `src/storage`。
 */
export { bootstrap, type BootstrapOptions, type BootstrapResult } from './bootstrap';
export { createAppService, type AppService } from './app-service';
export { systemClock, type Clock, type CancelTimer } from './clock';
export { documentVisibility, type AutoSettle, type VisibilitySource } from './auto-settle';
export {
  bundledBalanceSource,
  bundledContentSource,
  type BalanceSource,
  type ContentSource,
} from './sources';
export {
  findRescueSources,
  prepareRescueBackup,
  type RescueBackup,
  type RescueOptions,
  type RescueSource,
  type RescueSources,
} from './rescue';
/** Daily 頻率是否包含某個星期（core 的唯一定義；進階編輯預填自訂星期用） */
export { scheduleIncludes } from '../core/settlement';
export * from './types';
