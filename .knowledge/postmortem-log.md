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
