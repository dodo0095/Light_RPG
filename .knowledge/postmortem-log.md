# 晨光之誓 — 踩坑紀錄

> 使用 `/pitfall-record` 新增、`/pitfall-resolve` 標記解決。共通踩坑見 `.knowledge/postmortem-common.md`。

| 日期 | 問題 | 根因 | 正確做法 | 狀態 |
|------|------|------|---------|------|

### 2026-10-23 — Git Bash 找不到 node，導致 slash command 的取時間步驟失敗

| 項目 | 內容 |
|------|------|
| 分類 | process |
| 問題 | 執行 `/task-dispatch` 時，指令內的 `!`node -e "console.log(new Date().toISOString())"`` 失敗：`node: command not found`；`/task-start`、`/task-done` 也用同一行，會一樣失敗 |
| 原因 | Git Bash 的 PATH 沒有 `C:\Program Files\nodejs`（工作區 CLAUDE.md 已註明「PATH 可能缺」）；使用者家目錄沒有 `~/.bashrc` 可補 PATH |
| 解法 | 已採（1）（2026-10-23 老闆同意）：建立 `~/.bashrc` 補 PATH，`~/.bash_profile` 載入它；驗證 `bash -lc "node -v"` → v24.14.0。原備選：（1）在 `~/.bashrc` 加 `export PATH="$PATH:/c/Program Files/nodejs"`（全工作區生效，需老闆同意改個人環境）；（2）把 `.claude/commands/*.md` 的取時間指令改成 `date -u +%Y-%m-%dT%H:%M:%SZ`（不依賴 node） |
| 預防 | 指令範本不要假設 node 在 PATH；回報 Agent-hub 公司範本一併修正 |
| 狀態 | open（待重開 Claude Code 後重跑 /task-dispatch 確認才能 resolve） |
| 到期日 | 2026-11-06 |

### 2026-10-23 — Windows Application Control 擋下 Vite 8 的 rolldown 原生 binding

| 項目 | 內容 |
|------|------|
| 分類 | build |
| 問題 | T1 安裝 Vite 8 後執行失敗：`rolldown-binding.win32-x64-msvc.node` — "An Application Control policy has blocked this file"；改用 WASI（wasm）binding 則無法解析 Windows 路徑 |
| 原因 | 這台電腦的 Windows Application Control（WDAC／Smart App Control）政策不允許載入未受信任的原生 `.node` 模組；Vite 8 改用 rolldown，依賴該原生模組 |
| 解法 | 改用 esbuild 系的 Vite ~6.4.5＋Vitest ~4.1.12（Agent-hub 已在本機驗證過的組合）；TypeScript 釘 ~6.0.3（typescript-eslint 8.72 的 peer 範圍）；`pnpm-workspace.yaml` 設 `allowBuilds: esbuild: true` |
| 預防 | 升級 Vite／Vitest 或新增含原生 binding 的套件前，先在本機實跑一次；`package.json` 這三個套件用 `~` 鎖小版本，不要隨手升大版 |
| 狀態 | open（暫時解法；之後評估是否把 rolldown binding 加入信任清單） |
| 到期日 | 2026-11-06 |

### 2026-10-23 — AgentHub 產生的 hook 寫死絕對路徑，被 commit 進 repo

| 項目 | 內容 |
|------|------|
| 分類 | process |
| 問題 | `.claude/hooks/g5-pre-deploy.sh`、`stop-validator.sh` 內含 `cd "<worktree 絕對路徑>"` 與 log 路徑；從 worktree commit 後，主資料夾或其他電腦 checkout 會讓 hook 跑到別的目錄（worktree 刪除後直接失效） |
| 原因 | AgentHub HookManager 依 checkout 位置產生 hook，產物不可攜 |
| 解法 | 兩個檔案從版控移除並加入 `.gitignore`，每個位置保留 AgentHub 自己產生的版本 |
| 預防 | commit 前 `git grep -n "ALL PROJECT"` 檢查有沒有絕對路徑；回報 Agent-hub 改用 `git rev-parse --show-toplevel` 或 `$CLAUDE_PROJECT_DIR` |
| 狀態 | open（待 Agent-hub 範本修正） |
| 到期日 | 2026-11-06 |

### 2026-10-23 — 用 JS 樣板字串改檔，Windows 路徑的反斜線被吃掉

| 項目 | 內容 |
|------|------|
| 分類 | process |
| 問題 | tech-lead 用 `node -` ＋樣板字串（反引號）批次修改 `deploy/README.md`，`C:\Users\...`、`\nodejs` 變成 `C:Users...` 和換行，錯誤版本已推上 GitHub（commit 4166d61 之後），由 2026-10-23 下一個 commit 修正 |
| 原因 | JS 樣板字串會解析跳脫字元（`\n`、`\U` 等），反斜線路徑被當成跳脫序列 |
| 解法 | 含反斜線的內容改用 Edit 工具直接修改；修完 `git grep -nE "C:Users|odejs$"` 確認 |
| 預防 | 批次改檔遇到 Windows 路徑一律用 Edit 工具，不用樣板字串；改完必做 read-back |
| 狀態 | resolved |
| 到期日 | — |

### 2026-10-24 — 解合併衝突的腳本未生效，衝突標記被 commit

| 項目 | 內容 |
|------|------|
| 分類 | process |
| 問題 | 合併 product-manager 分支時，tech-lead 用正規表示式替換 `proposal/sprint1-dev-plan.md` 的衝突區塊，但檔案是 CRLF，`\n` 比對不到，替換沒發生；隨後 `git commit --no-edit` 把衝突標記提交進 merge commit（未推送，下一個 commit 修正） |
| 原因 | 只檢查了 grep 輸出卻沒讓它阻擋 commit；腳本對換行格式有假設 |
| 解法 | 改用 Edit 工具解衝突；commit 前 `git grep -nE "^(<<<<<<<|=======|>>>>>>>)( |$)"` 必須無結果 |
| 預防 | 解衝突一律用 Edit 工具；commit 前的衝突標記檢查要用 `&&` 串接，有結果就不 commit |
| 狀態 | resolved |
| 到期日 | — |
