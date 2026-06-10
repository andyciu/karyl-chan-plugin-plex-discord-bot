# karyl-chan-plugin-plex-discord-bot

本專案包含 karyl-chan 的 Plex 音樂播放插件，可在 Discord 中透過指令搜尋並播放 Plex 音樂庫的歌曲。

## 目錄結構

```
karyl-chan-plugin-plex-discord-bot/
├── docker-compose.yml        # Docker 本機測試用 compose 檔
├── .env.example              # 環境變數範本
├── packages/
│   └── plugin-plex/          # Plex 插件本体
│       ├── Dockerfile
│       ├── src/
│       └── ...
├── karyl-chan-main/          # karyl-chan 主機器人（submodule 或複本）
└── ...
```

## 本機 Docker 測試

### 1. 前置準備

#### Discord Bot 設定
1. 前往 [Discord Developer Portal](https://discord.com/developers/applications) 建立 Application
2. 在 **Bot** 分頁建立 bot 並複製 Token
3. 啟用權限：
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
4. 在 **OAuth2 > URL Generator** 生成邀請連結：
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Manage Channels`, `Manage Messages`, `Manage Roles`, `Add Reactions`, `Read Message History`, `Send Messages`, `View Channels`, `Connect`, `Speak`

#### Plex Token 取得
1. 登入 [plex.tv](https://plex.tv)
2. 前往 Settings → Plex TV → Your Apps
3. 或直接訪問 `https://plex.tv/pms/servers.xml`（需登入）

### 2. 設定環境變數

```bash
# 複製範本
cp .env.example .env

# 編輯 .env，填入以下必填資訊：
# - BOT_TOKEN        （Discord Developer Portal 取得）
# - ENCRYPTION_KEY   （產生方式見下方）
# - BOT_OWNER_IDS    （你的 Discord User ID）
# - PLEX_HOSTNAME    （Plex 伺服器 IP/hostname）
# - PLEX_TOKEN       （Plex 認證 token）
```

**產生 ENCRYPTION_KEY（PowerShell）：**
```powershell
powershell -Command "[System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32) | ForEach-Object { $_.ToString('x2') }"
```

**產生 ENCRYPTION_KEY（Linux/Mac）：**
```bash
openssl rand -hex 32
```

### 3. 啟動服務

```bash
# 使用 .env 檔案啟動
docker compose up -d

# 或手動 export 環境變數後啟動
export BOT_TOKEN=your_token
export ENCRYPTION_KEY=your_key
export BOT_OWNER_IDS=your_user_id
export PLEX_HOSTNAME=192.168.1.100
export PLEX_TOKEN=your_plex_token
docker compose up -d
```

### 4. 驗證

1. 檢查容器狀態：
   ```bash
   docker compose ps
   ```

2. 查看 logs：
   ```bash
   docker compose logs -f karyl-chan
   docker compose logs -f karyl-plex
   ```

3. 確認健康檢查通過：
   - karyl-chan: `http://localhost:3000/api/health/ready` 應返回 200
   - karyl-plex: `http://localhost:3001/health` 應返回 200

4. 在 Discord 中輸入 `/` 應能看到 `plex-` 開頭的指令（如 `/plex-play`, `/plex-search` 等）

### 5. 停止服務

```bash
docker compose down
```

## Plugin 環境變數說明

| 變數 | 必填 | 說明 |
|------|------|------|
| `BOT_TOKEN` | 是 | Discord bot token |
| `ENCRYPTION_KEY` | 是 | 32 位元 hex 字串 |
| `BOT_OWNER_IDS` | 是 | Bot 擁有者 Discord ID |
| `PLEX_HOSTNAME` | 是 | Plex 伺服器 IP/hostname |
| `PLEX_PORT` | 否 | Plex port，預設 32400 |
| `PLEX_TOKEN` | 是 | Plex 認證 token |
| `PLEX_SECTIONS_KEY` | 否 | 音樂庫 section key，預設 1 |
| `PLEX_DEFAULT_VOLUME` | 否 | 預設音量 0-100，預設 20 |

## 開發相關

```bash
# 建置 plugin（不使用 Docker 時）
cd packages/plugin-plex
npm install
npm run build
npm start
```