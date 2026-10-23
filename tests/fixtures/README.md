# 測試用 fixture（不是正式數值／內容）

這個資料夾的檔案**只給自動化測試使用**，數字與名稱都是刻意取的測試值：

- `balance.test.json`：數值設定檔結構測試用。難度代碼 `alpha`／`beta`、所有數字都不是遊戲數值。
  正式 `src/config/balance.json` 必須等 `.knowledge/decision-tables.md` 定案後照表填入。
- `content/*.test.json`：內容資料包 schema 測試用（「測試習慣 A」等）。
  正式內容由 product-manager 依企劃書提供，不得從這裡複製。
