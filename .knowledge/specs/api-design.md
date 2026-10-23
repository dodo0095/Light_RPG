# API 設計

> 版本: v1.0 | Sprint 1 | 最後更新: 2026-10-23

## 概述

晨光之誓第一版**沒有後端，也沒有 HTTP API**（`CLAUDE.md` 本專案特有規則 1）。所有資料存在 iPhone 的 IndexedDB。

## 詳細規格

| 項目 | 真相來源 |
|------|---------|
| 模組之間的介面（core／storage／services） | `proposal/sprint1-dev-plan.md` 第 5 節、`.knowledge/architecture.md` 第 2、5 節 |
| 資料格式、匯出／匯入 JSON | `.knowledge/data-model.md` 第 6、8 節 |

第二版加入雲端同步（Supabase 或 Django／Node.js）時，再於本文件定義端點，並遵守公司 api-standards（回應 JSON 為 snake_case，前端在 services 層轉換為 camelCase）。
