# karyl-chan-plugin-plex-discord-bot

本專案為 karyl-chan 的 Plex 音樂播放插件，可在 Discord 中透過指令搜尋並播放 Plex 音樂庫的歌曲。

## 目錄結構

```
karyl-chan-plugin-plex-discord-bot/
├── docker-compose.yml        # Docker 本機測試用 compose 檔
├── .env.example              # 環境變數範本
├── packages/
│   └── plugin-plex/          # Plex 插件本體
│       ├── Dockerfile
│       ├── README.md          # Plugin 詳細說明文件
│       ├── src/
│       └── ...
└── ...
```

## 功能特色

- **瀏覽音樂庫**：以 Artist → Album → Track 階層式瀏覽 Plex 音樂庫
- **智慧搜尋**：搜尋歌曲、專輯或藝術家，統一呈現結果
- **佇列系統**：將歌曲或專輯加入佇列，管理播放清單
- **語音播放**：加入 Discord 語音頻道，直接從 Plex 串流音樂
- **播放控制**：播放、暫停、恢復、跳過、停止、音量控制
- **現在播放**：查看當前曲目與接下來的播放清單

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
# - PLEX_PORT        （Plex 伺服器 Port，預設 32400）
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

## 指令使用說明

### 快速開始

1. 使用 `/plex-list` 或 `/plex-search` 找音樂
2. 使用 `/plex-add-to-queue <編號>` 將歌曲或專輯加入佇列
3. 使用 `/plex-play` 開始播放

### 佇列管理

| 指令 | 說明 |
|------|------|
| `/plex-play` | 開始播放佇列中的歌曲 |
| `/plex-queue [頁數]` | 檢視播放佇列 |
| `/plex-clearqueue` | 清除所有歌曲 |
| `/plex-remove <位置>` | 移除指定位置的歌曲 |

### 瀏覽與搜尋

| 指令 | 說明 |
|------|------|
| `/plex-list [查詢]` | 瀏覽音樂庫（Artist > Album > Track） |
| `/plex-list <編號>` | 深入瀏覽列表 |
| `/plex-search <關鍵字>` | 搜尋歌曲、專輯或藝術家 |

#### 瀏覽流程範例

```
1. /plex-list                         → 顯示所有 Artists
   📋 Artists (1-5 of 15)
   #1  🎤 周杰倫 (25 albums)
   #2  🎤 Taylor Swift (18 albums)
   ...

2. /plex-list 1                       → 進入 Artist #1，顯示其 Albums
   📋 Albums by 周杰倫
   #1  🎵 范特西 (10 tracks)
   #2  🎵 七里香 (12 tracks)
   ...

3. /plex-list 2                       → 進入 Album #2，顯示其 Tracks
   🎵 七里香 - 周杰倫
   #1  🌧️ 擱淺 (4:31)
   #2  🌧️ 園遊會 (4:09)
   ...

4. /plex-add-to-queue 3               → 將 Track #3 加入佇列
   ✅ 已將「七里香 - 止戰之殤」加入佇列
```

#### 搜尋範例

```
/plex-search 周杰倫                     → 搜尋並顯示所有周杰倫相關結果
/plex-add-to-queue 1                    → 將第一個結果加入佇列
```

### 加入佇列

| 指令 | 說明 |
|------|------|
| `/plex-add-to-queue <編號>` | 將歌曲或專輯加入佇列 |

- 從搜尋結果加入：支援歌曲、專輯（加入所有歌曲）、藝術家（需先瀏覽）
- 從列表加入：支援歌曲和專輯（加入所有歌曲）

### 播放控制

| 指令 | 說明 |
|------|------|
| `/plex-pause` | 暫停播放 |
| `/plex-resume` | 恢復播放 |
| `/plex-skip` | 跳過當前歌曲 |
| `/plex-stop` | 停止播放並離開語音頻道 |
| `/plex-volume <音量>` | 設定音量（0-100） |
| `/plex-nowplaying` | 顯示當前播放曲目 |

### 語音控制

| 指令 | 說明 |
|------|------|
| `/plex-join` | 加入你的語音頻道 |
| `/plex-leave` | 離開語音頻道 |

### 其他

| 指令 | 說明 |
|------|------|
| `/plex-help` | 顯示所有指令說明 |

#### 注意事項

- 列表會話有效期為 **10 分鐘**，逾時需重新開始瀏覽
- 編號會話綁定頻道，不同頻道有獨立瀏覽狀態
- 進入 Tracks 層級後，`/plex-list <編號>` 會顯示該曲目的詳細資訊（包含時長、格式等）

## 環境變數說明

### Bot 核心環境變數

| 變數 | 必填 | 說明 |
|------|------|------|
| `KARYL_PLUGIN_SETUP_SECRET` | 是 | Plugin 設定驗證密鑰，用於插件初始化與安全驗證 |
| `BOT_TOKEN` | 是 | Discord bot token |
| `ENCRYPTION_KEY` | 是 | 32 位元 hex 字串 |
| `BOT_OWNER_IDS` | 是 | Bot 擁有者 Discord ID |

### Plex 環境變數

| 變數 | 必填 | 說明 | 預設值 |
|------|------|------|--------|
| `PLEX_HOSTNAME` | 是 | Plex 伺服器 IP/hostname | |
| `PLEX_PORT` | 否 | Plex port | `32400` |
| `PLEX_TOKEN` | 是 | Plex 認證 token | |
| `PLEX_SECTIONS_KEY` | 否 | 音樂庫 section key | `1` |
| `PLEX_DEFAULT_VOLUME` | 否 | 預設音量 0-100 | `20` |

## 架構說明

本插件基於 [@karyl-chan/plugin-sdk](https://github.com/karyl-chan/karyl-chan/tree/main/packages/plugin-sdk) 建構：

- **狀態管理**：使用 per-guild KV 儲存佇列和播放狀態
- **語音整合**：使用 bot 的 voice RPC facade 處理 Discord 語音連線
- **Plex API**：使用 `plex-api` npm 套件查詢 Plex 伺服器
- **會話追蹤**：維護列表和搜尋會話，用於導航和佇列操作

## 開發相關

```bash
# 建置 plugin（不使用 Docker 時）
cd packages/plugin-plex
npm install
npm run build
npm start
```

## 相關連結

- [karyl-chan](https://github.com/karyl-chan/karyl-chan) - 主專案
- [Plugin SDK](https://github.com/karyl-chan/karyl-chan/tree/main/packages/plugin-sdk) - 插件開發框架
- [Plugin README](./packages/plugin-plex/README.md) - 插件詳細說明文件（英文）