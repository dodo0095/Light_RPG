# 晨光之誓 — Agent 指南

> 本文件為專案索引導航，所有 Agent 執行任務前必須先閱讀本文件，再依任務需求查閱對應文件。

---

## 專案簡介

- **專案名稱**: 晨光之誓（習慣養成 RPG）
- **類型**: Web 應用（PWA，純前端、本機儲存）
- **核心價值**: 保留 Habitica 的完整機制，但把「從零設定」變成「點選預設」，並包上日式 RPG 的畫面與故事
- **目標用戶**: 第一版給老闆本人＋身邊少數人試用（iPhone Safari 加入主畫面）
- **開發平台**: Windows 11（Git Bash）
- **產品真相來源**: `晨光之誓_企劃書.md`（目前 v0.2）

## 共用開發規則

> 以下 2 份文件包含所有 Agent 必須遵循的共用規則，執行任務前**必須先閱讀**。

| 文件 | 內容 |
|------|------|
| `.knowledge/company-rules.md` | 文件治理、文件層級、禁止憑空想像、命名骨架、Commit 紀律、依賴/環境變數規則 |
| `.knowledge/team-workflow.md` | 團隊架構、指揮鏈、Sprint 流程、Gate、Review、上線/回滾 |

## 本專案特有規則

1. **沒有後端**：第一版資料全部存在 IndexedDB，不得引入伺服器或第三方帳號服務（第二版才評估 Supabase／Django）。
2. **數值不得寫死在邏輯裡**：金幣、經驗、扣血、等級曲線一律從數值設定檔讀取，數值以 `.knowledge/decision-tables.md` 為準。
3. **內容與程式分離**：預設習慣庫、職業套組（以及之後的事件、Boss、同伴）都寫成資料檔，不得寫死在元件內。
4. **換日邏輯是高風險區**：任何修改都必須附單元測試，要涵蓋跨午夜、多日未開、旅館期間。
5. **資料結構要能升級**：持久化資料帶 `schemaVersion`；變更結構時必須附遷移程式，遷移前自動備份。
6. **原創內容**：角色、怪物、名稱、美術全部原創，不得使用任何現有作品的素材。

## 命名規範差異（覆蓋共用骨架）

| 層 | 風格 | 範例 |
|----|------|------|
| 資料欄位（IndexedDB／JSON 資料包） | camelCase | `createdAt`, `goldReward`, `schemaVersion` |
| 資料包 id | snake_case | `mid_autumn_2026`, `class_warrior` |

## 技術棧

> ✅ 2026-10-23 老闆定案（方案 A）。詳細見 `proposal/sprint1-tech-stack.md`、`.knowledge/architecture.md` 第 4、5 節。

| 類型 | 技術 |
|------|------|
| 語言 | TypeScript（strict） |
| 前端 | Preact＋@preact/signals，Vite 建置 |
| 本機儲存 | IndexedDB＋idb（外包自寫 Repository 介面） |
| 離線 | vite-plugin-pwa（Service Worker＋Web App Manifest） |
| 資料驗證 | Zod |
| 測試 | Vitest（＋fake-indexeddb） |
| 套件管理 | pnpm |
| 部署 | 老闆自己的 Windows 電腦＋Cloudflare Tunnel（自有網域，固定子網域） |

## 設計稿合規規則（強制）

> 前端 UI 必須按設計稿開發，UI 不一致 = Blocker。

1. **先讀設計稿**：`docs/design/mockup-*.html`
2. **識別所有狀態**：設計稿上的每個 UI 狀態都要實作
3. **以手機直式為主**：以 iPhone 寬度（390px）為基準，確認安全區域（瀏海、Home 條）
4. **不確定就問**：回報 L1 → 協調 Design Director

## 踩坑紀錄

| 問題 | 原因 | 正確做法 |
|------|------|---------|
| （尚無） | | |

## 可用指令（Slash Commands）— 強制使用

> 以下指令已部署到 `.claude/commands/`。
> **使用方式**：讀取對應的 `.claude/commands/{指令名}.md` 檔案，依照其中的步驟執行。
>
> **強制規則：遇到下列「使用時機」描述的場景時，必須執行對應指令，不得跳過或手動替代。**

| 指令 | 用途 | 使用時機（遇到即必須執行） |
|------|------|--------------------------|
| `/project-kickoff` | 初始化專案結構 | 專案建立後第一件事（2026-10-23 已執行） |
| `/product-diagnosis` | 產品六問診斷（G0 前置） | 提案前驗證產品方向 |
| `/sprint-proposal` | 產出 Sprint 提案書 | Sprint 規劃階段 |
| `/dev-plan` | 產出開發計畫書 | G0 通過後展開任務 |
| `/task-dispatch` | 老闆派工，建立 .tasks/ 檔案 | 老闆分配任務時 |
| `/task-delegation` | 拆解任務到計畫書第 6 節 | L1 拆解子任務時 |
| `/task-start` | 標記任務為進行中 | Agent 開始執行任務時 |
| `/task-status` | 更新任務狀態 | 任務狀態變更時 |
| `/task-done` | 標記任務完成（待審查） | 任務交付時 |
| `/task-approve` | L1 審核通過，標記為 done | L1 Review 通過後 |
| `/review` | L1 內部 Code Review | 程式碼完成後送審 |
| `/pm-review` | PM 審核 Gate 提交 | L1 提交 Gate 後 |
| `/gate-record` | 記錄 Gate 審查決策 | Gate 審查結果出爐時 |
| `/pre-deploy` | 上線前檢查清單（G5） | 部署前最後確認 |
| `/pitfall-record` | 記錄踩坑經驗 | 發現問題時立即記錄 |
| `/pitfall-resolve` | 標記踩坑已解決 | 問題修復後 |
| `/sprint-retro` | Sprint 回顧報告 | Sprint 結束時 |
| `/harness-audit` | Harness 健康度稽核 | 定期檢查 |

## 專案文件索引

| 文件 | 說明 |
|------|------|
| `晨光之誓_企劃書.md` | 產品企劃（世界觀、機制、職業、事件、畫面） |
| `proposal/sprint1-proposal.md` | Sprint 1 提案書（G0 已通過） |
| `.knowledge/company-rules.md` | 共用開發規則 |
| `.knowledge/team-workflow.md` | 共用工作流程 |
| `.knowledge/project-overview.md` | 專案概述 |
| `.knowledge/architecture.md` | 架構（🔴 規範） |
| `.knowledge/day-rollover.md` | 換日／日結模組設計（🔴 規範） |
| `proposal/sprint1-tech-stack.md` | 技術棧決策（已定案） |
| `.knowledge/data-model.md` | 資料模型（🔴 規範，Sprint 1 設計步驟產出） |
| `.knowledge/decision-tables.md` | 數值決策表（🔴 規範，Sprint 1 設計步驟產出） |
| `.knowledge/acceptance-criteria.md` | 驗收標準（🟡 規格） |
| `.knowledge/postmortem-log.md` | 踩坑紀錄 |

## 公司知識庫

> **使用規則（company-rules.md 第 7 條）**：需要引用公司規範時，先檢查本地 `.knowledge/` 是否已有副本。若無，從下方來源路徑複製一份到 `.knowledge/` 再使用。不需要的規範不必複製。

| 規範 | 來源路徑 | 本地副本 |
|------|---------|---------|
| 程式碼規範 | `../Agent-hub/.knowledge/company/standards/coding-standards.md` | `.knowledge/coding-standards.md` |
| 測試規範 | `../Agent-hub/.knowledge/company/standards/testing-standards.md` | `.knowledge/testing-standards.md` |
| 品質 Checklist | `../Agent-hub/.knowledge/company/standards/quality-checklist.md` | `.knowledge/quality-checklist.md` |
| Code Review SOP | `../Agent-hub/.knowledge/company/sop/code-review.md` | `.knowledge/code-review.md` |
| Sprint 規劃 SOP | `../Agent-hub/.knowledge/company/sop/sprint-planning.md` | `.knowledge/sprint-planning.md` |
