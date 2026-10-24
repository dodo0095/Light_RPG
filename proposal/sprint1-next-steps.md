# Sprint 1：目前進度與接續步驟

> **更新**: 2026-10-24（tech-lead）
> **最新 commit**: 見 GitHub `dodo0095/Light_RPG` 的 `main`

## 目前進度

- Gate：G0 ✅、G1 ✅、G2 ✅（2026-10-24）；下一關 **G3 測試驗收**，再來 **G5 部署就緒**
- 任務：T1～T21 全部完成；**T22 正式部署**進行中；**T23 iPhone 實機驗收**未開始
- 規格、審查報告、待辦：
  - 開發計畫書：`proposal/sprint1-dev-plan.md`（第 10 節有所有任務、Review、Gate 紀錄）
  - G2 審查報告：`docs/reviews/sprint1-g2-review-round1.md`、`round2.md`
  - Sprint 2 技術待辦：`proposal/sprint2-backlog.md`
  - iPhone 驗收清單：`docs/acceptance/sprint1-iphone-checklist.md`

## 接下來要做的事（照順序）

### 1. 老闆：在部署機更新並啟動（T22）

```bat
cd /d C:\Users\史塔克實驗室\Desktop\Light_RPG
git pull
pnpm install --frozen-lockfile
pnpm build
node deploy\serve.mjs
```

- 視窗保持開著；出現「無法監聽 127.0.0.1:5810」代表已經在跑，不用重開
- 想開機自動啟動：見 `deploy/README.md` 第三節（`schtasks`，路徑換成部署機實際位置，先用 `where node` 確認 node 路徑）

### 2. 老闆：iPhone 實機驗收（T23）

- 從主畫面打開 App → 點「有新版本，點此更新」→ 進入選職業
- 照 `docs/acceptance/sprint1-iphone-checklist.md` 的 A～G 逐項打勾
- D 區（日結、旅館）要隔天 04:00 後才能確認
- 記下 H 區的 14 天試用開始日
- 發現問題時記錄：哪個畫面、做了什麼、預期與實際結果

### 3. 回來找 tech-lead 時，提供

- 驗收清單的結果（哪些打勾、哪些有問題）
- 設定頁底部的版本號

### 4. tech-lead 接著會做

- 依驗收結果判斷嚴重度，有問題就派工修正、重新部署、複驗
- A～G 全部通過 → 記錄 T22、T23 完成 → 送 **G3** 給老闆審核
- G3 通過 → `/pre-deploy` 檢查 → **G5 部署就緒**
- 14 天試用結束 → experiment-tracker 統計打開率與完成率 → `/sprint-retro` → Sprint 2 提案（參考 `sprint2-backlog.md`）

## 環境備忘

- 網址：`https://rpg.starklab.tw`（部署機的 Caddy → `127.0.0.1:5810`，設定段落 `deploy/caddy-rpg.caddy`）
- 從 LINE 點連結開會無法離線，請用 Safari 開
- 開發機 Git Bash 已補 PATH（`~/.bashrc`：Node.js、npm 全域）；新的 Claude Code session 會自動生效
