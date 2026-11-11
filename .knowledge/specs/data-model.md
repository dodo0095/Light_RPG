# 資料模型（索引）

> 版本: v2.0 | Sprint 2 | 最後更新: 2026-11-11

## 概述

資料模型的唯一真相來源是 **`.knowledge/data-model.md`**（🔴 規範）。本檔只做索引，避免兩份內容不同步；請不要在這裡複製欄位定義。

Sprint 2 升級為 **schemaVersion 2**（v2），設計在 `.knowledge/data-model.md` **第 12 節**；待決事項在第 13 節。

## 詳細規格

### Sprint 1（v1）

| 內容 | 位置 |
|------|------|
| 三類資料（設定檔／內容／使用者資料） | `.knowledge/data-model.md` 第 1 節 |
| IndexedDB store 與索引 | 第 3、4 節 |
| 數值設定檔結構 | 第 5 節 |
| 事件（打卡、取消＝反向事件） | 第 6 節 |
| 內容資料包格式 | 第 7 節 |
| 匯出 JSON 格式 | 第 8 節 |
| schemaVersion 與遷移 | 第 9 節 |
| Sprint 2／第二版預留 | 第 10 節 |

### Sprint 2（v2）

| 內容 | 位置 |
|------|------|
| 設計總覽 | 第 12.1 節 |
| IndexedDB 結構 v2（`adventure`、`worldStates`、`dailyDraws`） | 第 12.2 節 |
| `adventure`（章節、Boss 累計傷害、看過的劇情）與狀態轉換 | 第 12.3 節 |
| 隨機事件：`dailyDraws`（抽籤、seed）、`worldStates` | 第 12.4 節 |
| 新事件類型、打卡／反向／日結事件 `payload` 新欄位 | 第 12.5 節 |
| 日結對 Boss 的影響與冪等；**各寫入動作的 transaction 一覽（12.6.1）** | 第 12.6 節 |
| 內容資料包（`chapter`、`boss`、`story`、`world_event`、`class_sets` 擴充） | 第 12.7 節 |
| 推播：伺服器存什麼、本機 `meta.pushReminder` | 第 12.8 節（HTTP API 見 `.knowledge/specs/api-design.md`） |
| 匯出／匯入 v2、驗證分層與降級規則 | 第 12.9 節 |
| 遷移 v1→v2：函式、升級流程、**程式修改清單（12.10.3）**、失敗回滾 | 第 12.10 節 |
| 測試清單：**MG-01～MG-20（12.10.5）**、**TC-V2-*（12.10.6）** | 第 12.10.5、12.10.6 節 |
| 數值設定檔欄位對照 v2 | 第 12.11 節（值以 `.knowledge/decision-tables.md` 第 14 節為準） |
| v2 待決事項 | 第 13 節 |

### 相關規範

| 內容 | 位置 |
|------|------|
| 日結冪等（v2 註記） | `.knowledge/day-rollover.md` 第 3.4 節 |
| 戰鬥與事件數值 | `.knowledge/decision-tables.md` 第 14 節 |
| 實作任務與測試對應 | `proposal/sprint2-dev-plan.md` 第 6、7 節 |
