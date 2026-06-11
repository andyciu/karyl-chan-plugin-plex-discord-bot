# Karyl Plex Plugin

A [karyl-chan](https://github.com/karyl-chan/karyl-chan) plugin that enables searching and playing music from your Plex Media Server library via Discord slash commands.

## Features

- **Search & Play**: Search your Plex music library by song title or artist
- **Voice Playback**: Join your Discord voice channel and stream music directly from Plex
- **Queue Management**: Add songs to queue, view queue, remove songs, clear queue
- **Playback Controls**: Pause, resume, skip, stop
- **Volume Control**: Adjust playback volume (0-100%)
- **Now Playing**: View current track info

## Commands

| Command | Description |
|---------|-------------|
| `/plex-play <query>` | Search and play a song from Plex |
| `/plex-pause` | Pause current playback |
| `/plex-resume` | Resume paused playback |
| `/plex-skip` | Skip current song |
| `/plex-stop` | Stop playback and leave voice |
| `/plex-queue [page]` | View the song queue |
| `/plex-clearqueue` | Clear all songs from queue |
| `/plex-remove <position>` | Remove a song by queue position |
| `/plex-volume <level>` | Set volume (0-100) |
| `/plex-nowplaying` | Show current track |
| `/plex-search <query>` | Search Plex library |
| `/plex-join` | Join your voice channel |
| `/plex-leave` | Leave voice channel |
| `/plex-help` | Show all commands |

## Setup

### Prerequisites

- A running [karyl-chan](https://github.com/karyl-chan/karyl-chan) bot
- A Plex Media Server with music library
- Your Plex authentication token

### Getting Your Plex Token

1. Go to [plex.tv](https://plex.tv)
2. Sign in to your account
3. Go to Settings → Plex TV → Your Apps
4. Or visit: https://plex.tv/pms/servers.xml (while logged in)
5. Your token will be visible in the URL or page content

### Configuration

The plugin can be configured via the karyl-chan admin panel or environment variables:

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `PLEX_HOSTNAME` | Plex server hostname/IP | `localhost` |
| `PLEX_PORT` | Plex server port | `32400` |
| `PLEX_TOKEN` | Plex authentication token | (required) |
| `PLEX_USERNAME` | Plex username (optional) | |
| `PLEX_PASSWORD` | Plex password (optional) | |
| `PLEX_SECTIONS_KEY` | Music library section key | `1` |
| `PLEX_DEFAULT_VOLUME` | Default volume (0-100) | `20` |

### Docker Setup

Add the plugin to your `docker-compose.yml`:

```yaml
services:
  karyl-chan:
    # ... your existing config
    environment:
      - PLUGINS=karyl-plex

  karyl-plex:
    build: ./packages/plugin-plex
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - BOT_URL=http://karyl-chan:3000
      - PLUGIN_URL=http://karyl-plex:3000
      - PLEX_HOSTNAME=your-plex-server.local
      - PLEX_PORT=32400
      - PLEX_TOKEN=your-plex-token
    depends_on:
      - karyl-chan
```

## Usage

1. Join a voice channel in your Discord server
2. Use `/plex-play <song title or artist>` to search and play music
3. Use other commands to control playback and manage the queue

## Architecture

This plugin is built using the [@karyl-chan/plugin-sdk](https://github.com/karyl-chan/karyl-chan/tree/main/packages/plugin-sdk):

- **State Management**: Uses per-guild KV storage for queue and playback state
- **Voice Integration**: Uses the bot's voice RPC facade for Discord voice connections
- **Plex API**: Uses the `plex-api` npm package to query your Plex server

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Start the plugin
npm start
```

## License

MIT