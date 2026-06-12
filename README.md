# karyl-chan-plugin-plex-discord-bot

本專案包含 karyl-chan 的 Plex 音樂播放插件，可在 Discord 中透過指令搜尋並播放 Plex 音樂庫的歌曲。

## 目錄結構

```
karyl-chan-plugin-plex-discord-bot/
├── docker-compose.yml        # Docker 本機測試用 compose 檔
├── .env.example              # 環境變數範本
├── packages/
│   └── plugin-plex/          # Plex 插件本體
│       ├── Dockerfile
│       ├── src/
│       └── ...
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
# - PLEX_PORT        （Plex 伺服器 Port)
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

### 播放控制

| 指令 | 說明 |
|------|------|
| `/plex-play <query>` | 搜尋並播放歌曲 |
| `/plex-pause` | 暫停播放 |
| `/plex-resume` | 恢復播放 |
| `/plex-skip` | 跳過當前歌曲 |
| `/plex-stop` | 停止播放並離開語音頻道 |

### 佇列管理

| 指令 | 說明 |
|------|------|
| `/plex-queue [頁數]` | 檢視播放佇列 |
| `/plex-clearqueue` | 清除所有歌曲 |
| `/plex-remove <位置>` | 移除指定位置的歌曲 |
| `/plex-add-to-queue <編號>` | 將瀏覽列表中的曲目加入佇列 |

### 瀏覽 Plex 音樂庫

`/plex-list` 指令讓你可以階層式瀏覽 Plex 音樂庫（Artist > Album > Track）。

#### 基本用法

| 指令 | 說明 |
|------|------|
| `/plex-list` | 列出所有 Artists（附流水號） |
| `/plex-list <編號>` | 瀏覽指定項目（依當前層級進入 Artist/Album） |
| `/plex-list <關鍵字>` | 搜尋 Artist 或 Album |
| `/plex-list <關鍵字> <編號>` | 搜尋後瀏覽結果 |

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
/plex-list 周杰倫                     → 搜尋並顯示所有周杰倫相關結果
/plex-list 周杰倫 1                   → 進入第一個結果（會是 Artist 頁面）
```

#### 注意事項

- 列表會話有效期為 **10 分鐘**，逾時需重新開始瀏覽
- 編號會話綁定頻道，不同頻道有獨立瀏覽狀態
- 進入 Tracks 層級後，`/plex-list <編號>` 會顯示該曲目的詳細資訊（包含時長、格式等）

### 其他指令

| 指令 | 說明 |
|------|------|
| `/plex-nowplaying` | 顯示當前播放曲目 |
| `/plex-search <query>` | 搜尋 Plex 音樂庫 |
| `/plex-join` | 加入你的語音頻道 |
| `/plex-leave` | 離開語音頻道 |
| `/plex-help` | 顯示所有指令說明 |

## Plugin 環境變數說明

| 變數 | 必填 | 說明 |
|------|------|------|
| `KARYL_PLUGIN_SETUP_SECRET` | 是 | Plugin 設定驗證密鑰，用於插件初始化與安全驗證 |
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