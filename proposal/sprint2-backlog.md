# Sprint 2 Backlog（技術面，Sprint 1 延後項目）

> **整理者**: tech-lead
> **日期**: 2026-10-24
> **來源**: Sprint 1 G2 審查（`docs/reviews/sprint1-g2-review-round1.md`、`round2.md`）與實作過程中的決策
> **用途**: Sprint 2 提案時由 project-lead／product-manager 決定優先序；本表不是承諾範圍

| # | 項目 | 來源 | 說明 | 建議負責 |
|---|------|------|------|---------|
| B1 | 像素字型 | 字型決策 A（dev-plan 第 3 節） | Sprint 1 不載入外部字型；S2 自帶俐方體 11 號（`@font-face`，`'self'` 來源），評估字型檔大小與首次載入時間 | design-director＋frontend-developer |
| B2 | 職業圖示移到資料包 | G2 m5 | `class_sets` schema 加 `icon` 欄位，UI 不再寫死對照表（CLAUDE.md 規則 3） | product-manager（資料）＋frontend-developer |
| B3 | 匯入的語意一致性檢查 | G2 n3 | 重複事件 id 會被覆蓋、有角色但 `lastSettledDayKey` 為 null 會卡在選職業頁等；需手動竄改 JSON 才會發生 | frontend-developer |
| B4 | 快速新增的圖稿（老闆 2026-10-24 已接受此改動） | T20／G2 已知差異 | 今天頁「＋」改開快速新增；請 design-director 補一張 sheet 圖稿，之後的設計稿審查才有依據 | design-director |
| B5 | App 圖示配色 | G2 第二輪附註 | `scripts/generate-icons.mjs` 圖示底色仍為 G1 前的 `#1a2b4c`，theme-color 已改 `#0a1030`；正式圖示由設計決定 | design-director |
| B6 | 「來自職業套組」判斷的邊界 | T15／T16 | 選職業當天又從預設庫加入同一模板時，也會顯示「來自職業套組」；若需精確，任務需記錄建立來源 | frontend-developer |
| B7 | 主畫面 App 的持久儲存觀察 | T3 S1 | Safari 分頁 `persist()` 回 false；主畫面 App 的結果由設定頁顯示，14 天試用期間記錄 | experiment-tracker |
