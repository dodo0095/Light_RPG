# 晨光之誓：部署說明（給老闆）

## 架構一句話

iPhone → `https://rpg.starklab.tw`（老闆的反向代理）→ `http://127.0.0.1:5810`（**部署機**上的 `deploy/serve.mjs`，提供 `dist/`）

- **部署機**：老闆的另一台 Windows 電腦，反向代理也裝在這台。以下步驟都在部署機上做。
- **開發機**：寫程式的電腦，只負責把程式推到 GitHub（https://github.com/dodo0095/Light_RPG ，公開 repo，clone 不需要登入）。

App 平常離線運作；只有**第一次安裝**和**取得新版本**時，部署機需要開機、伺服器在跑。

---

## 一、給反向代理的設定需求

> 實際使用中的 Caddy 設定段落見 `deploy/caddy-rpg.caddy`（2026-10-23 上線）。

| 項目 | 需求 |
|------|------|
| 網址 | `rpg.starklab.tw`（全小寫，定了不要改：換網址＝iPhone 上的存檔讀不到） |
| 轉送目標 | `http://127.0.0.1:5810` |
| HTTPS | **必須**，憑證要有效（PWA／Service Worker 只能在 HTTPS 下運作） |
| 快取 | **代理不得快取**，`Cache-Control` 標頭要原樣轉送（否則 iPhone 拿不到新版本） |
| 方法 | 只需要 GET、HEAD |

### 代理不在這台電腦上時

伺服器預設只聽 `127.0.0.1`（只有本機連得到）。若反向代理裝在別台機器，要用環境變數 `RPG_HOST` 改成這台電腦的區網 IP，例如 `RPG_HOST=192.168.11.10`，並把代理目標改成 `http://192.168.11.10:5810`。

> **風險**：改成區網 IP 後，同一個區網內的任何裝置（訪客 Wi-Fi、其他電腦、IoT 裝置）都能直接用 HTTP 連進來，不經過 HTTPS 也不經過代理。若必須這樣做，請在 Windows 防火牆只允許代理那台機器的 IP 連 5810 port。能把代理裝在同一台電腦就盡量這樣做。

---

## 二、部署機第一次安裝

### 1. 安裝工具（只做一次）

| 工具 | 下載 | 確認指令 |
|------|------|---------|
| Git for Windows | https://git-scm.com/download/win | `git --version` |
| Node.js（LTS 版，22 以上） | https://nodejs.org/ | `node -v` |
| pnpm 12.15.0 | 裝好 Node.js 後執行 `npm install -g pnpm@12.15.0`（要跟 `package.json` 的 `packageManager` 一致） | `pnpm -v` 顯示 `12.15.0` |

> ⚠️ 本專案只能用 **pnpm**，不要執行 `npm install`。npm 讀不懂 pnpm 的鎖定檔，會出現 `Cannot read properties of null (reading 'edgesOut')` 之類的錯誤。如果已經執行過 `npm install`，請先刪掉專案裡的 `node_modules` 資料夾和 `package-lock.json`（若有），再執行 `pnpm install`。

### 2. 下載程式並建置

建議放在沒有空白的路徑，例如 `C:\Light_RPG`（以下都用這個路徑；放在別處請一起改工作排程器的指令）：

```bat
cd /d C:\
git clone https://github.com/dodo0095/Light_RPG.git
cd Light_RPG
pnpm install --frozen-lockfile
pnpm build
```

`--frozen-lockfile` 會確保部署機裝的套件版本跟開發機完全一樣。若放在其他位置（例如桌面），後面所有 `C:\Light_RPG` 都要換成實際路徑。

> 如果 `pnpm install` 或 `pnpm build` 出現「An Application Control policy has blocked this file」：代表這台電腦的 Windows 安全政策擋了建置工具（開發機遇過類似狀況，見 `.knowledge/postmortem-log.md`）。請把錯誤訊息貼給 tech-lead；暫時可以改在開發機 build，再把整個 `dist\` 資料夾複製到部署機的 `C:\Light_RPG\dist\`。

### 3. 啟動

```bat
cd /d C:\Light_RPG
node deploy\serve.mjs
```

成功時會印出：

```
[serve] 晨光之誓靜態檔伺服器已啟動：http://127.0.0.1:5810/
[serve] 根目錄：...\dist
```

若 `dist/` 不存在（還沒 build），會印出錯誤並結束。若 5810 被別的程式占用，會印出「無法監聽」並結束。

可用的環境變數（通常不用設）：

| 變數 | 預設 | 用途 |
|------|------|------|
| `RPG_PORT` | `5810` | 監聽 port |
| `RPG_HOST` | `127.0.0.1` | 綁定位址（見上方風險說明） |
| `RPG_DIST` | 專案的 `dist\` | 要提供的資料夾 |

---

## 三、開機自動啟動（Windows 工作排程器）

### 方法 A：一行指令（用一般的「命令提示字元」執行即可，不需要系統管理員）

部署機上的位置是 `C:\Light_RPG`（放在別處請一起改這行）：

```bat
schtasks /Create /TN "RPG-serve" /SC ONLOGON /RU "%USERNAME%" /RL LIMITED /TR "\"C:\Program Files\nodejs\node.exe\" \"C:\Light_RPG\deploy\serve.mjs\"" /F
```

- `/SC ONLOGON`：你登入 Windows 時自動啟動
- `/RU "%USERNAME%"` ＋ `/RL LIMITED`：用你自己的一般權限執行。**不要用 SYSTEM**：這個伺服器會透過反向代理對外提供服務，萬一有漏洞，用 SYSTEM 執行會讓整台電腦的檔案都可能被讀取（2026-10-23 tech-lead Review 修正）
- 代價：要登入 Windows 後才會啟動。平常 App 在手機上離線運作，只有安裝和更新時需要伺服器在跑，影響不大

建好後可立刻手動啟動一次：`schtasks /Run /TN "RPG-serve"`

### 方法 B：圖形介面

1. 開始功能表搜尋「工作排程器」並開啟
2. 右側「建立工作」（不是「建立基本工作」）
3. 「一般」頁：名稱 `RPG-serve`；選「不論使用者登入與否均執行」
4. 「觸發程序」頁：新增 →「啟動時」
5. 「動作」頁：新增 →「啟動程式」
   - 程式：`C:\Program Files\nodejs\node.exe`
   - 引數：`deploy\serve.mjs`
   - 開始位置：`C:\Light_RPG`
6. 「設定」頁：取消勾選「如果工作執行超過下列時間，便停止工作」（預設 3 天會被停掉）；勾選「如果工作失敗，重新啟動間隔 1 分鐘」
7. 按確定（會要求輸入 Windows 密碼）

### 確認有在跑

```bat
schtasks /Query /TN "RPG-serve" /V /FO LIST
curl -I http://127.0.0.1:5810/sw.js
```

`curl` 回 `HTTP/1.1 200 OK` 就是在跑。

### 停止／移除

```bat
schtasks /End /TN "RPG-serve"
schtasks /Delete /TN "RPG-serve" /F
```

`/End` 只停止這一次（下次開機還會自動啟動）；`/Delete` 是整個移除。

---

## 四、發佈新版本

1. 開發機把新版推到 GitHub `main`（tech-lead 負責）
2. 在部署機執行：

   ```bat
   cd /d C:\Light_RPG
   git pull
   pnpm install --frozen-lockfile
   pnpm build
   ```
3. 伺服器**不用重啟**（它每次都直接讀 `dist\` 的檔案）
4. iPhone 開 App 時會出現「點此更新」提示，點下去即完成

## 五、回滾（新版本出問題時）

1. 通知 tech-lead：在開發機 `git revert <出問題的 commit>` 並推到 GitHub
2. 在部署機執行 `git pull`、`pnpm install`、`pnpm build`（覆蓋 `dist\`）
3. iPhone 開 App 時同樣會出現更新提示，點下去即回到舊版內容

> 存檔在 iPhone 的 IndexedDB 裡，發佈或回滾都不會刪除存檔。

---

## 六、驗證指令

本機（伺服器啟動後）：

```bash
curl -I http://127.0.0.1:5810/sw.js
```

應看到 `Cache-Control: no-cache`。`dist\assets\` 下檔名帶 hash 的檔案（例如 `index-CoLhNrAE.js`）應看到 `Cache-Control: public, max-age=31536000, immutable`。

反向代理設定好後：

```bash
curl -I https://rpg.starklab.tw/sw.js
```

應同樣看到 `Cache-Control: no-cache`，且**不應**出現代理加上的快取標頭（例如 `Age:`、`X-Cache: HIT`）。

## 七、開發者：測試

```bash
node --test "deploy/*.test.mjs"
```

（Node 24 的 `node --test` 不接受資料夾參數，需用檔名或 glob。）
