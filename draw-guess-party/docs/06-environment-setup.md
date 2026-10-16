# Ubuntu Server 開發環境建置

> 本文件依另一個 Claude 對話中產生的原始規劃內容整理重建，並標註本次整合實作與原規劃的差異。

## 基礎套件

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git build-essential
```

## Node.js（LTS）

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 套件管理

**差異提醒**：原規劃使用 `pnpm`（與音樂猜歌正式環境一致），本次整合實作的沙盒環境改用 `npm` 完成（容器內未安裝 `pnpm`）。部署到與音樂猜歌相同的正式環境（已慣用 `pnpm`）前，建議：

```bash
npm install -g pnpm
pnpm -v
# 到專案目錄後
rm -rf node_modules package-lock.json
pnpm install
```

改回 pnpm 後行為應一致，本專案未使用任何 npm 專屬語法。

## 安裝 Socket.io

```bash
pnpm add socket.io socket.io-client
```

（已安裝於本次交付版本，此步驟僅供從零建置時參考。）

## pnpm 建置腳本核准（v11+ 必看）

新版 pnpm（v11 起）預設封鎖依賴套件的原生編譯腳本（`esbuild`、`unrs-resolver` 等），`pnpm install` 時若看到：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@x.x.x, unrs-resolver@x.x.x
```

代表這些套件的編譯腳本被擋住了，`tsx`（依賴 `esbuild`）會因此無法正常運作。本專案已在根目錄放入 `pnpm-workspace.yaml`（`allowBuilds: { esbuild: true, unrs-resolver: true }`），正常情況下 `pnpm install` 不會再跳出這個警告；若仍然看到，代表你的 pnpm 版本可能更早（v10 以下用的是 `package.json` 的 `pnpm.onlyBuiltDependencies`，v11 起改用 `pnpm-workspace.yaml` 的 `allowBuilds`，兩者互不相容），可以直接手動核准，不用等設定檔生效：

```bash
pnpm approve-builds esbuild unrs-resolver
```

帶套件名稱執行不會跳出互動選單，會直接核准並補跑編譯腳本，同時把結果寫回 `pnpm-workspace.yaml`。跑完記得重新 `pnpm install` 確認警告消失。

## 自訂伺服器

**差異提醒**：原規劃是建立 `server.js`（JavaScript），本次整合實作改為 `server.ts` + `tsx`（見 `02-architecture.md` 說明），`package.json` scripts 對應為：

```json
{
  "scripts": {
    "dev": "tsx server.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx server.ts"
  }
}
```

正式環境部署前需確認 `tsx` 已作為 `devDependencies` 安裝（已在本次交付版本中），systemd 服務的 `ExecStart` 對應為 `npm run start`（內部即 `tsx server.ts`）。若正式環境偏好不依賴 `tsx`、改用純編譯後的 `server.js`，需另外處理 TypeScript 編譯步驟，不在本次整合範圍內。

## PostgreSQL（Phase 4+ 使用，尚未串接）

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

```bash
sudo -u postgres psql -c "CREATE USER draw_party_dev WITH PASSWORD '設定密碼';"
sudo -u postgres psql -c "CREATE DATABASE draw_guess_party OWNER draw_party_dev;"
```

## 環境變數

於專案根目錄建立 `.env`，**務必確認 `.gitignore` 已排除這個檔案**（音樂猜歌專案曾經不小心把含真實密碼的 `.env` 包進部署用的 zip；`git status` 執行前務必先確認 `.env` 沒有出現在待加入清單）：

```
DATABASE_URL="postgresql://draw_party_dev:設定密碼@localhost:5432/draw_guess_party"
ADMIN_USER="管理後台帳號"
ADMIN_PASSWORD="管理後台密碼"
NODE_ENV="production"
```

`.gitignore` 需包含：

```
.env
node_modules/
.next/
```

## Prisma（Phase 4+ 使用，尚未串接）

```bash
pnpm add -D prisma
pnpm add @prisma/client
pnpm prisma init
```

初始化後依 `03-data-model.md` 編寫 `prisma/schema.prisma`，執行遷移：

```bash
pnpm prisma migrate dev --name init
```

**每次修改 `prisma/schema.prisma` 後，記得手動執行 `pnpm exec prisma generate`**（音樂猜歌專案部署時踩過的坑：`next build` 不會自動重新產生 Prisma Client）。

## 開發伺服器

```bash
npm run dev
```

啟動後除了確認網頁能開，也確認終端機有印出 `> draw-guess-party ready on http://localhost:3000`，代表自訂 server 與 Socket.io 有正常掛載。

## Git 初始化

建議一開始就接上 GitHub，部署更新流程用 `git pull` + `npm install` + `npm run build` + 重啟服務，不要用 zip 上傳解壓縮的方式。

## 防火牆（開發期若需區網存取）

```bash
sudo ufw allow 3000/tcp
```

## 正式環境部署備忘

比照音樂猜歌專案：Vultr VPS、PostgreSQL、Cloudflare Tunnel（可沿用同一帳號，另開一個子網域，`config.yml` 的 `ingress` 多加一條規則即可）、systemd 服務。與音樂猜歌專案的唯一差異：systemd 服務的 `ExecStart` 是啟動 `server.ts`（透過 `npm run start`），不是 `next start`。
