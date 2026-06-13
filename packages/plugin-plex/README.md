# Karyl Plex Plugin

A [karyl-chan](https://github.com/karyl-chan/karyl-chan) plugin that enables searching and playing music from your Plex Media Server library via Discord slash commands.

## Features

- **Browse Library**: Navigate your Plex music library by Artist → Album → Track hierarchy
- **Smart Search**: Search for tracks, albums, or artists with unified results
- **Random Play**: Randomly add songs from your entire library to the queue
- **Queue System**: Add tracks or entire albums to queue, manage your playback queue
- **Voice Playback**: Join your Discord voice channel and stream music directly from Plex
- **Playback Controls**: Play, pause, resume, skip, stop, volume control
- **Now Playing**: View current track info and upcoming queue

## Quick Start

1. Use `/plex-list` or `/plex-search` to find music
2. Use `/plex-add-to-queue <number>` to add tracks or albums to queue
3. Use `/plex-play` to start playing from queue

## Commands

### Queue Management
| Command | Description |
|---------|-------------|
| `/plex-play` | Start playing from the queue |
| `/plex-queue [page]` | View the current queue |
| `/plex-clearqueue` | Clear all songs from queue |
| `/plex-remove <position>` | Remove a song by queue position |

### Browse & Search
| Command | Description |
|---------|-------------|
| `/plex-list [query]` | Browse library (Artist > Album > Track) |
| `/plex-list <number>` | Browse deeper into the list |
| `/plex-search <query>` | Search for tracks, albums, or artists |
| `/plex-random-song <number>` | Add random songs from entire library to queue |

### Random Play Examples

```
/plex-random-song 10                     # Add 10 random songs to queue
/plex-random-song 1000                   # If library has only 500 songs, adds all in random order
```

### Add to Queue
| Command | Description |
|---------|-------------|
| `/plex-add-to-queue <number>` | Add a track or album to queue |

- From search results: supports tracks, albums (adds all tracks), artists (browse first)
- From list: supports tracks and albums (adds all tracks)

### Playback Control
| Command | Description |
|---------|-------------|
| `/plex-pause` | Pause current playback |
| `/plex-resume` | Resume paused playback |
| `/plex-skip` | Skip current song |
| `/plex-stop` | Stop playback and leave voice |
| `/plex-volume <level>` | Set volume (0-100) |
| `/plex-nowplaying` | Show current track |

### Voice
| Command | Description |
|---------|-------------|
| `/plex-join` | Join your voice channel |
| `/plex-leave` | Leave voice channel |

### Info
| Command | Description |
|---------|-------------|
| `/plex-help` | Show all commands |

## Usage Examples

### Browse Library
```
/plex-list                              # List all artists
/plex-list Taylor Swift                 # Browse albums by Taylor Swift
/plex-list 2                            # Browse into album #2
/plex-add-to-queue 3                    # Add track #3 to queue
```

### Search for Music
```
/plex-search imagine dragons            # Search for tracks/albums/artists
/plex-add-to-queue 1                    # Add result #1 to queue
```

### Random Play
```
/plex-random-song 10                   # Add 10 random songs to queue
/plex-play                              # Start playing from queue
```

### Play Music
```
/plex-play                              # Start playing from queue
/plex-skip                              # Skip to next song
/plex-pause                             # Pause playback
/plex-resume                            # Resume playback
```

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

1. Use `/plex-list` or `/plex-search` to find music in your Plex library
2. Use `/plex-add-to-queue <number>` to add tracks or albums to the queue
3. Use `/plex-play` to start playing from the queue
4. Use other commands to control playback and manage the queue

## Architecture

This plugin is built using the [@karyl-chan/plugin-sdk](https://github.com/karyl-chan/karyl-chan/tree/main/packages/plugin-sdk):

- **State Management**: Uses per-guild KV storage for queue and playback state
- **Voice Integration**: Uses the bot's voice RPC facade for Discord voice connections
- **Plex API**: Uses the `plex-api` npm package to query your Plex server
- **Session Tracking**: Maintains list and search sessions for navigation and queue operations

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