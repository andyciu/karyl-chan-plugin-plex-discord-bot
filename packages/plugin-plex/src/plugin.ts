import PlexAPI from "plex-api";
import {
  ApplicationCommandOptionType,
  definePlugin,
  definePluginCommand,
  defineGuildFeature,
  definePluginCapability,
  definePluginComponent,
  componentCustomId,
  Events,
  type CommandContext,
  type CommandReply,
  type PluginContext,
  type ComponentContext,
} from "@karyl-chan/plugin-sdk";
import { loadConfig } from "./config.js";

const PLUGIN_KEY = "karyl-plex";

// ── Types ────────────────────────────────────────────────────────────────────

interface PlexConfig {
  hostname: string;
  port: number;
  token: string;
  username: string;
  password: string;
  sectionsKey: string;
  deviceName: string;
  defaultVolume: number;
}

interface PlexTrack {
  key: string;
  title: string;
  artist: string;
  album: string;
  thumb: string;
  duration: number;
}

interface QueuedTrack extends PlexTrack {
  queuedBy: string;
  queuedAt: number;
}

interface GuildState {
  queue: QueuedTrack[];
  currentTrack: QueuedTrack | null;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  repeatMode: "off" | "one" | "all";
}

interface PlexSearchResult {
  key: string;
  title: string;
  artist?: string;
  album?: string;
  thumb?: string;
  type: string;
  size: number;
  offset: number;
}

// ── List Navigation Types ─────────────────────────────────────────────────────

type ListLevel = "artists" | "albums" | "tracks";

interface ListItem {
  index: number;
  key: string;
  title: string;
  subtitle?: string;
  thumb?: string;
  type: ListLevel;
  duration?: number; // for tracks
  parentKey?: string; // Artist key for albums, Album key for tracks
  artist?: string; // for tracks display
}

interface ListSession {
  guildId: string;
  channelId: string;
  level: ListLevel;
  items: ListItem[];
  parentQuery?: string; // Parent name for context (e.g., Artist name when showing albums)
  createdAt: number;
}

// ── State Management ───────────────────────────────────────────────────────────

// Global Plex API client (initialized with config)
let plexClient: PlexAPI | null = null;
let plexConfig: PlexConfig | null = null;

/** Active list sessions keyed by `${guildId}-${channelId}` */
const listSessions = new Map<string, ListSession>();

/** TTL for list sessions in milliseconds (10 minutes) */
const LIST_SESSION_TTL = 10 * 60 * 1000;

/**
 * Get or create a list session for the current channel.
 */
async function getListSession(
  ctx: CommandContext,
): Promise<ListSession | null> {
  if (!ctx.guildId || !ctx.channelId) return null;
  const sessionKey = `${ctx.guildId}-${ctx.channelId}`;
  const session = listSessions.get(sessionKey);
  
  if (session) {
    // Check if session is still valid
    if (Date.now() - session.createdAt > LIST_SESSION_TTL) {
      listSessions.delete(sessionKey);
      return null;
    }
    return session;
  }
  return null;
}

/**
 * Create or update a list session.
 */
function setListSession(ctx: CommandContext, session: ListSession): void {
  if (!ctx.guildId || !ctx.channelId) return;
  const sessionKey = `${ctx.guildId}-${ctx.channelId}`;
  listSessions.set(sessionKey, session);
}

/**
 * Clear the list session for the current channel.
 */
function clearListSession(ctx: CommandContext): void {
  if (!ctx.guildId || !ctx.channelId) return;
  const sessionKey = `${ctx.guildId}-${ctx.channelId}`;
  listSessions.delete(sessionKey);
}

/**
 * Periodically clean up expired list sessions.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of listSessions) {
    if (now - session.createdAt > LIST_SESSION_TTL) {
      listSessions.delete(key);
    }
  }
}, 60000); // Clean up every minute

// Helper to get Plex base URL
function getPlexUrl(): string {
  if (!plexConfig) return "";
  if (plexConfig.port === 443) {
    return `https://${plexConfig.hostname}`;
  }
  return `http://${plexConfig.hostname}:${plexConfig.port}`;
}

// Initialize Plex client from config
function initPlexClient(config: PlexConfig): PlexAPI {
  return new PlexAPI({
    hostname: config.hostname,
    port: config.port,
    username: config.username,
    password: config.password,
    token: config.token,
    options: {
      identifier: "karyl-plex",
      product: "Karyl Plex Plugin",
      version: "0.1.0",
      deviceName: config.deviceName || "Karyl Plex Bot",
      platform: "Discord",
      device: "Plugin",
    },
  });
}

// Helper to get or initialize guild state from CommandContext
async function getGuildState(ctx: CommandContext): Promise<GuildState> {
  if (!ctx.guildId) {
    return {
      queue: [],
      currentTrack: null,
      isPlaying: false,
      isPaused: false,
      volume: 0.2,
      repeatMode: "off",
    };
  }
  const kv = ctx.kv.guild<GuildState>(ctx.guildId);
  const state = await kv.get("state");
  if (state) return state;

  const newState: GuildState = {
    queue: [],
    currentTrack: null,
    isPlaying: false,
    isPaused: false,
    volume: plexConfig?.defaultVolume
      ? plexConfig.defaultVolume / 100
      : 0.2,
    repeatMode: "off",
  };
  await kv.set("state", newState);
  return newState;
}

// Helper to save guild state from CommandContext
async function saveGuildState(ctx: CommandContext, state: GuildState): Promise<void> {
  if (!ctx.guildId) return;
  const kv = ctx.kv.guild<GuildState>(ctx.guildId);
  await kv.set("state", state);
}

// Helper to get or initialize guild state from PluginContext (for lifecycle hooks)
async function getGuildStateFromPlugin(
  ctx: PluginContext,
  guildId: string,
): Promise<GuildState> {
  const kv = ctx.kv.guild<GuildState>(guildId);
  const state = await kv.get("state");
  if (state) return state;

  const newState: GuildState = {
    queue: [],
    currentTrack: null,
    isPlaying: false,
    isPaused: false,
    volume: plexConfig?.defaultVolume
      ? plexConfig.defaultVolume / 100
      : 0.2,
    repeatMode: "off",
  };
  await kv.set("state", newState);
  return newState;
}

// Helper to save guild state from PluginContext (for lifecycle hooks)
async function saveGuildStateFromPlugin(
  ctx: PluginContext,
  guildId: string,
  state: GuildState,
): Promise<void> {
  const kv = ctx.kv.guild<GuildState>(guildId);
  await kv.set("state", state);
}

// Search Plex for tracks
async function searchPlex(
  client: PlexAPI,
  query: string,
  limit = 10,
): Promise<PlexSearchResult[]> {
  const url = `/search/?type=10&query=${encodeURIComponent(query)}&X-Plex-Container-Size=${limit}`;
  const result = await client.query(url);
  if (!result.MediaContainer?.Metadata) return [];

  return result.MediaContainer.Metadata.map((track: Record<string, unknown>) => {
    let artist = "";
    if ("originalTitle" in track && track.originalTitle) {
      artist = String(track.originalTitle);
    } else if ("grandparentTitle" in track && track.grandparentTitle) {
      artist = String(track.grandparentTitle);
    }
    return {
      key: String(track.key || ""),
      title: String(track.title || "Unknown"),
      artist,
      thumb: String(track.thumb || ""),
      type: String(track.type || "track"),
      size: Number(result.MediaContainer?.size || 0),
      offset: 0,
    };
  });
}

// Get album tracks from an album key
async function getAlbumTracks(
  client: PlexAPI,
  albumKey: string,
  ctx: CommandContext,
): Promise<PlexTrack[]> {
  const result = await client.query(albumKey);
  if (!result.MediaContainer?.Metadata) return [];

  ctx.log.info("Album tracks metadata", { metadata: result.MediaContainer.Metadata });

  return result.MediaContainer.Metadata.filter(
    (track: Record<string, unknown>) => track.type === "track",
  ).map((track: Record<string, unknown>) => {
    let artist = "";
    if ("originalTitle" in track && track.originalTitle) {
      artist = String(track.originalTitle);
    } else if ("grandparentTitle" in track && track.grandparentTitle) {
      artist = String(track.grandparentTitle);
    }
    const media = track.Media as Array<Record<string, unknown>>;
    const partArray = (media?.[0] as Record<string, unknown>)?.Part as Array<Record<string, unknown>>;
    const part = partArray?.[0] as Record<string, unknown>;
    return {
      key: String(part?.key || track.key || ""),
      title: String(track.title || "Unknown"),
      artist,
      album: String(track.parentTitle || track.grandparentTitle || ""),
      thumb: String(track.thumb || ""),
      duration: Number(track.duration || 0),
    };
  });
}

// ── Library Navigation Functions ──────────────────────────────────────────────

/**
 * Get all artists from Plex music library
 */
async function getArtists(
  client: PlexAPI,
  sectionsKey: string = "1",
  ctx?: CommandContext,
): Promise<ListItem[]> {
  try {
    const result = await client.query(`/library/sections/${sectionsKey}/all?type=8`);
    if (!result.MediaContainer?.Metadata) return [];

    const items: ListItem[] = result.MediaContainer.Metadata
      .filter((artist: Record<string, unknown>) => artist.type === "artist")
      .map((artist: Record<string, unknown>, idx: number) => ({
        index: idx + 1,
        key: String(artist.key || ""),
        title: String(artist.title || "Unknown Artist"),
        subtitle: `${artist.childCount || 0} albums`,
        thumb: String(artist.thumb || ""),
        type: "artists" as ListLevel,
      }));

    return items;
  } catch (err) {
    ctx?.log.error("Failed to get artists", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Get albums for a specific artist
 */
async function getArtistAlbums(
  client: PlexAPI,
  artistKey: string,
  ctx?: CommandContext,
): Promise<ListItem[]> {
  try {
    const result = await client.query(artistKey);
    if (!result.MediaContainer?.Metadata) return [];

    const items: ListItem[] = result.MediaContainer.Metadata
      .filter((item: Record<string, unknown>) => item.type === "album")
      .map((album: Record<string, unknown>, idx: number) => ({
        index: idx + 1,
        key: String(album.key || ""),
        title: String(album.title || "Unknown Album"),
        subtitle: `${album.childCount || 0} tracks`,
        thumb: String(album.thumb || ""),
        type: "albums" as ListLevel,
        parentKey: artistKey,
      }));

    return items;
  } catch (err) {
    ctx?.log.error("Failed to get artist albums", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Get tracks for a specific album
 */
async function getAlbumTracksList(
  client: PlexAPI,
  albumKey: string,
  artistName?: string,
  ctx?: CommandContext,
): Promise<ListItem[]> {
  try {
    const result = await client.query(albumKey);
    if (!result.MediaContainer?.Metadata) return [];

    const items: ListItem[] = result.MediaContainer.Metadata
      .filter((item: Record<string, unknown>) => item.type === "track")
      .map((track: Record<string, unknown>, idx: number) => {
        let artist = artistName || "";
        if (!artist && "originalTitle" in track && track.originalTitle) {
          artist = String(track.originalTitle);
        } else if (!artist && "grandparentTitle" in track) {
          artist = String(track.grandparentTitle);
        }
        
        const media = track.Media as Array<Record<string, unknown>>;
        const partArray = (media?.[0] as Record<string, unknown>)?.Part as Array<Record<string, unknown>>;
        const part = partArray?.[0] as Record<string, unknown>;
        
        return {
          index: idx + 1,
          key: String(part?.key || track.key || ""),
          title: String(track.title || "Unknown Track"),
          subtitle: formatDuration(Number(track.duration || 0)),
          thumb: String(track.thumb || ""),
          type: "tracks" as ListLevel,
          duration: Number(track.duration || 0),
          artist,
        };
      });

    return items;
  } catch (err) {
    ctx?.log.error("Failed to get album tracks", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Format list items into a display string
 */
function formatListDisplay(items: ListItem[], level: ListLevel): string {
  const lines: string[] = [];
  const header = level === "artists" 
    ? "🎵 **Artists**" 
    : level === "albums" 
      ? "💿 **Albums**" 
      : "🎶 **Tracks**";
  
  lines.push(header);
  lines.push("─".repeat(40));

  for (const item of items) {
    const subtitle = item.subtitle ? ` • ${item.subtitle}` : "";
    lines.push(`${item.index}. **${item.title}**${subtitle}`);
  }

  return lines.join("\n");
}

// ── Format Helpers ────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatQueueList(
  state: GuildState,
  start = 1,
  end?: number,
): string {
  const lines: string[] = [];
  const actualEnd = end || state.queue.length;

  for (let i = start - 1; i < actualEnd && i < state.queue.length; i++) {
    const track = state.queue[i];
    lines.push(
      `${i + 1}. **${track.artist}** - ${track.title} ${track.album ? `(${track.album})` : ""}`,
    );
  }

  return lines.join("\n") || "_Queue is empty_";
}

// ── Commands ───────────────────────────────────────────────────────────────────

const playCommand = definePluginCommand({
  name: "plex-play",
  description: "Play a song from Plex library",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "query",
      description: "Song title or artist to search for",
      required: true,
    },
  ],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId || !ctx.channelId) {
      return { content: "Use this inside a server channel.", ephemeral: true };
    }

    if (!plexConfig || !plexClient) {
      return {
        content: "Plex is not configured. Ask an admin to set up the Plex connection.",
        ephemeral: true,
      };
    }

    const query = String(ctx.options.query || "").trim();
    if (!query) {
      return { content: "Please provide a search query.", ephemeral: true };
    }

    try {
      const results = await searchPlex(plexClient, query);

      if (results.length === 0) {
        return { content: "No songs found matching your query.", ephemeral: true };
      }

      // Join voice channel (user will join first)
      await ctx.voice.join({
        guildId: ctx.guildId,
        userId: ctx.userId,
      });

      const state = await getGuildState(ctx);

      if (results.length === 1) {
        // Single result - play directly
        const track = results[0];

        // Get the actual media file URL via getAlbumTracks (which gets part.key)
        const albumTracks = await getAlbumTracks(plexClient, track.key, ctx);
        const mediaTrack = albumTracks[0];

        if (!mediaTrack) {
          return {
            content: "Could not retrieve track media. Please try again.",
            ephemeral: true,
          };
        }

        const queuedTrack: QueuedTrack = {
          key: mediaTrack.key,
          title: track.title,
          artist: track.artist || "Unknown Artist",
          album: track.album || mediaTrack.album,
          thumb: track.thumb || mediaTrack.thumb,
          duration: mediaTrack.duration,
          queuedBy: ctx.userDisplayName,
          queuedAt: Date.now(),
        };

        // Only set as currentTrack, don't push to queue
        // (queue is for upcoming tracks, currentTrack is what's currently playing)
        state.isPlaying = true;
        state.currentTrack = queuedTrack;
        await saveGuildState(ctx, state);

        const plexUrl = getPlexUrl();
        const playUrl = `${plexUrl}${mediaTrack.key}?X-Plex-Token=${plexConfig.token}`;

        // playUrl log
        ctx.log.info("Playing track from Plex", {
          title: track.title,
          artist: track.artist,
          album: track.album,
          playUrl,
        });
        
        await ctx.voice.play({ guildId: ctx.guildId, url: playUrl });

        // Start tracking playback for auto-leave functionality
        startPlaybackTracker(ctx, ctx.guildId, mediaTrack.duration);

        return {
          content: `🎵 Now playing: **${track.artist}** - ${track.title}`,
          embeds: track.thumb
            ? [
                {
                  image: {
                    url: `${plexUrl}/photo/:/transcode?url=${encodeURIComponent(track.thumb)}&width=300&height=300&X-Plex-Token=${plexConfig.token}`,
                  },
                },
              ]
            : undefined,
        };
      }

      // Multiple results - list them
      const lines = results.map((r, i) => {
        return `${i + 1}. **${r.artist || "Unknown"}** - ${r.title}`;
      });

      return {
        content: `Found ${results.length} songs. Reply with a number (1-${results.length}) to play:\n\n${lines.join("\n")}`,
        ephemeral: true,
      };
    } catch (err) {
      ctx.log.error("Plex search failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        content: "Failed to search Plex. Please try again later.",
        ephemeral: true,
      };
    }
  },
});

const pauseCommand = definePluginCommand({
  name: "plex-pause",
  description: "Pause the current playback",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    try {
      await ctx.voice.pause({ guildId: ctx.guildId, paused: true });
      return { content: "⏸️ Playback paused." };
    } catch (err) {
      return {
        content: "Nothing is currently playing.",
        ephemeral: true,
      };
    }
  },
});

const resumeCommand = definePluginCommand({
  name: "plex-resume",
  description: "Resume paused playback",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    try {
      await ctx.voice.pause({ guildId: ctx.guildId, paused: false });
      return { content: "▶️ Playback resumed." };
    } catch (err) {
      return {
        content: "Nothing to resume.",
        ephemeral: true,
      };
    }
  },
});

const skipCommand = definePluginCommand({
  name: "plex-skip",
  description: "Skip the current song",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    try {
      await ctx.voice.stop(ctx.guildId);

      // Check if there's a next track in queue
      const state = await getGuildState(ctx);
      if (state.queue.length > 0) {
        const nextTrack = state.queue.shift()!;
        state.currentTrack = nextTrack;
        state.isPlaying = true;
        state.isPaused = false;
        await saveGuildState(ctx, state);

        const plexUrl = getPlexUrl();
        const playUrl = `${plexUrl}${nextTrack.key}?X-Plex-Token=${plexConfig!.token}`;

        await ctx.voice.play({ guildId: ctx.guildId, url: playUrl });

        // Restart tracker for new track
        startPlaybackTracker(ctx, ctx.guildId, nextTrack.duration);

        return {
          content: `⏭️ Skipped! Now playing: **${nextTrack.artist}** - ${nextTrack.title}`,
        };
      } else {
        // No more tracks in queue
        state.currentTrack = null;
        state.isPlaying = false;
        await saveGuildState(ctx, state);

        // Stop tracker and leave
        stopPlaybackTracker(ctx.guildId);
        await ctx.voice.leave(ctx.guildId);

        return { content: "⏭️ Skipped! Queue is now empty." };
      }
    } catch (err) {
      return {
        content: "Nothing to skip.",
        ephemeral: true,
      };
    }
  },
});

const stopCommand = definePluginCommand({
  name: "plex-stop",
  description: "Stop playback and clear the queue",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    try {
      // Stop the playback tracker
      stopPlaybackTracker(ctx.guildId);

      await ctx.voice.stop(ctx.guildId);
      await ctx.voice.leave(ctx.guildId);

      // Clear state
      const state = await getGuildState(ctx);
      state.queue = [];
      state.currentTrack = null;
      state.isPlaying = false;
      state.isPaused = false;
      await saveGuildState(ctx, state);

      return { content: "⏹️ Playback stopped and queue cleared." };
    } catch (err) {
      return {
        content: "Nothing to stop.",
        ephemeral: true,
      };
    }
  },
});

const queueCommand = definePluginCommand({
  name: "plex-queue",
  description: "View the current queue",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  options: [
    {
      type: ApplicationCommandOptionType.Integer,
      name: "page",
      description: "Page number",
      required: false,
    },
  ],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    const page = Math.max(1, Number(ctx.options.page || 1));
    const pageSize = 10;
    const state = await getGuildState(ctx);

    if (state.queue.length === 0 && !state.currentTrack) {
      return { content: "Queue is empty. Use `/plex-play` to add songs.", ephemeral: true };
    }

    const lines: string[] = [];

    if (state.currentTrack) {
      lines.push(
        `🎵 **Now Playing:** ${state.currentTrack.artist} - ${state.currentTrack.title}`,
      );
      lines.push("");
    }

    if (state.queue.length > 0) {
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      const totalPages = Math.ceil(state.queue.length / pageSize);

      lines.push(`📜 **Queue** (${state.queue.length} songs, page ${page}/${totalPages}):`);
      lines.push("");
      lines.push(formatQueueList(state, start + 1, end));

      if (page < totalPages) {
        lines.push("");
        lines.push(`Use \`/plex-queue page:${page + 1}\` to see more.`);
      }
    }

    return { content: lines.join("\n") };
  },
});

const clearqueueCommand = definePluginCommand({
  name: "plex-clearqueue",
  description: "Clear all songs from the queue",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    const state = await getGuildState(ctx);
    const count = state.queue.length;

    state.queue = [];
    await saveGuildState(ctx, state);

    return { content: `🗑️ Cleared ${count} songs from queue.` };
  },
});

const removeCommand = definePluginCommand({
  name: "plex-remove",
  description: "Remove a song from the queue by position",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  options: [
    {
      type: ApplicationCommandOptionType.Integer,
      name: "position",
      description: "Queue position to remove (1-based)",
      required: true,
    },
  ],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    const position = Number(ctx.options.position);
    if (isNaN(position) || position < 1) {
      return { content: "Invalid position. Use `/plex-queue` to see positions.", ephemeral: true };
    }

    const state = await getGuildState(ctx);

    if (position > state.queue.length) {
      return {
        content: `Invalid position. Queue has ${state.queue.length} songs.`,
        ephemeral: true,
      };
    }

    const removed = state.queue.splice(position - 1, 1)[0];
    await saveGuildState(ctx, state);

    return {
      content: `🗑️ Removed: **${removed.artist}** - ${removed.title}`,
    };
  },
});

const volumeCommand = definePluginCommand({
  name: "plex-volume",
  description: "Set the playback volume (0-100)",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  options: [
    {
      type: ApplicationCommandOptionType.Integer,
      name: "level",
      description: "Volume level (0-100)",
      required: true,
      min_value: 0,
      max_value: 100,
    },
  ],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    const level = Number(ctx.options.level);
    if (isNaN(level) || level < 0 || level > 100) {
      return { content: "Volume must be between 0 and 100.", ephemeral: true };
    }

    const state = await getGuildState(ctx);
    state.volume = level / 100;
    await saveGuildState(ctx, state);

    return { content: `🔊 Volume set to ${level}%` };
  },
});

const nowplayingCommand = definePluginCommand({
  name: "plex-nowplaying",
  description: "Show what's currently playing",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    const state = await getGuildState(ctx);

    if (!state.currentTrack) {
      return { content: "Nothing is playing. Use `/plex-play` to start.", ephemeral: true };
    }

    const status = state.isPaused ? "⏸️ Paused" : "🎵 Playing";
    const lines = [
      `${status}: **${state.currentTrack.artist}** - ${state.currentTrack.title}`,
    ];

    if (state.currentTrack.album) {
      lines.push(`Album: ${state.currentTrack.album}`);
    }

    lines.push("");
    lines.push(`Volume: ${Math.round(state.volume * 100)}%`);

    if (state.queue.length > 0) {
      lines.push(`Up next: ${state.queue.length} songs`);
    }

    return { content: lines.join("\n") };
  },
});

const searchCommand = definePluginCommand({
  name: "plex-search",
  description: "Search Plex library for songs or artists",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "query",
      description: "Search query",
      required: true,
    },
    {
      type: ApplicationCommandOptionType.Integer,
      name: "limit",
      description: "Max results (default 10)",
      required: false,
      min_value: 1,
      max_value: 50,
    },
  ],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    if (!plexClient) {
      return {
        content: "Plex is not configured.",
        ephemeral: true,
      };
    }

    const query = String(ctx.options.query || "").trim();
    const limit = Math.min(50, Math.max(1, Number(ctx.options.limit || 10)));

    if (!query) {
      return { content: "Please provide a search query.", ephemeral: true };
    }

    try {
      const results = await searchPlex(plexClient, query, limit);

      if (results.length === 0) {
        return { content: "No results found.", ephemeral: true };
      }

      const lines = results.map((r, i) => {
        return `${i + 1}. **${r.artist || "Unknown Artist"}** - ${r.title}`;
      });

      return {
        content: `Found ${results.length} results:\n\n${lines.join("\n")}\n\nUse \`/plex-play\` to play a song.`,
        ephemeral: true,
      };
    } catch (err) {
      ctx.log.error("Plex search failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        content: "Search failed. Please try again.",
        ephemeral: true,
      };
    }
  },
});

const joinCommand = definePluginCommand({
  name: "plex-join",
  description: "Join your voice channel",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    try {
      // Join voice channel of the user who invoked the command
      await ctx.voice.join({
        guildId: ctx.guildId,
        userId: ctx.userId,
      });
      return { content: "🔊 Joined your voice channel." };
    } catch (err) {
      return {
        content: "Failed to join voice channel. Make sure you're in a voice channel.",
        ephemeral: true,
      };
    }
  },
});

const leaveCommand = definePluginCommand({
  name: "plex-leave",
  description: "Leave the voice channel and stop playback",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId) {
      return { content: "Use this inside a server.", ephemeral: true };
    }

    try {
      // Stop the playback tracker
      stopPlaybackTracker(ctx.guildId);
      await ctx.voice.leave(ctx.guildId);

      // Clear state
      const state = await getGuildState(ctx);
      state.queue = [];
      state.currentTrack = null;
      state.isPlaying = false;
      state.isPaused = false;
      await saveGuildState(ctx, state);

      return { content: "👋 Left voice channel." };
    } catch (err) {
      return {
        content: "Not connected to a voice channel.",
        ephemeral: true,
      };
    }
  },
});

const helpCommand = definePluginCommand({
  name: "plex-help",
  description: "Show available Plex commands",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  async handler(_ctx: CommandContext): Promise<CommandReply> {
    const lines = [
      "**🎵 Karyl Plex Commands**",
      "",
      "**Playback:**",
      "`/plex-play <query>` - Search and play a song",
      "`/plex-pause` - Pause playback",
      "`/plex-resume` - Resume playback",
      "`/plex-skip` - Skip current song",
      "`/plex-stop` - Stop and leave voice channel",
      "",
      "**Queue:**",
      "`/plex-queue [page]` - View the queue",
      "`/plex-clearqueue` - Clear all songs",
      "`/plex-remove <position>` - Remove a song",
      "",
      "**Browse Library:**",
      "`/plex-list` - List all artists",
      "`/plex-list <query>` - List albums of an artist or tracks of an album",
      "`/plex-list <number>` - Browse deeper into the list",
      "`/plex-add-to-queue <number>` - Add a track to queue by number",
      "",
      "**Info:**",
      "`/plex-nowplaying` - Show current track",
      "`/plex-search <query>` - Search Plex library",
      "",
      "**Voice:**",
      "`/plex-join` - Join your voice channel",
      "`/plex-leave` - Leave voice channel",
      "",
      "**Note:** Join a voice channel before using playback commands.",
    ];

    return { content: lines.join("\n"), ephemeral: true };
  },
});

// ── List Navigation Commands ─────────────────────────────────────────────────

const listCommand = definePluginCommand({
  name: "plex-list",
  description: "Browse Plex library by Artist > Album > Track hierarchy",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "query",
      description: "Artist or Album name to browse (optional - lists all artists if not provided)",
      required: false,
    },
    {
      type: ApplicationCommandOptionType.Integer,
      name: "number",
      description: "Item number from previous list to browse into",
      required: false,
      min_value: 1,
    },
  ],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId || !ctx.channelId) {
      return { content: "Use this inside a server channel.", ephemeral: true };
    }

    if (!plexClient || !plexConfig) {
      return {
        content: "Plex is not configured. Ask an admin to set up the Plex connection.",
        ephemeral: true,
      };
    }

    const query = String(ctx.options.query || "").trim();
    const itemNumber = Number(ctx.options.number || 0);

    try {
      // Get current session to determine context
      const session = await getListSession(ctx);
      const sectionsKey = plexConfig.sectionsKey || "1";

      // Case 1: No query, no number - List all artists (root level)
      if (!query && !itemNumber) {
        const artists = await getArtists(plexClient, sectionsKey, ctx);
        
        if (artists.length === 0) {
          return { content: "No artists found in your Plex library.", ephemeral: true };
        }

        const newSession: ListSession = {
          guildId: ctx.guildId,
          channelId: ctx.channelId,
          level: "artists",
          items: artists,
          createdAt: Date.now(),
        };
        setListSession(ctx, newSession);

        const display = formatListDisplay(artists, "artists");
        return {
          content: `${display}\n\n_Use \`/plex-list <Artist name> <number>\` or \`/plex-list <number>\` to browse into an artist._`,
          ephemeral: true,
        };
      }

      // Case 2: Has item number - use current session
      if (itemNumber && session) {
        const item = session.items.find(i => i.index === itemNumber);
        
        if (!item) {
          return { 
            content: `Invalid item number. Current list has ${session.items.length} items.\n\n${formatListDisplay(session.items, session.level)}`, 
            ephemeral: true 
          };
        }

        if (session.level === "artists") {
          // Browse into artist's albums
          const artistName = item.title;
          const albums = await getArtistAlbums(plexClient, item.key, ctx);
          
          if (albums.length === 0) {
            return { content: `No albums found for **${artistName}**.`, ephemeral: true };
          }

          const newSession: ListSession = {
            guildId: ctx.guildId,
            channelId: ctx.channelId,
            level: "albums",
            items: albums,
            parentQuery: artistName,
            createdAt: Date.now(),
          };
          setListSession(ctx, newSession);

          const display = formatListDisplay(albums, "albums");
          return {
            content: `${display}\n\n**Albums by ${artistName}**\n_Use \`/plex-list <number>\` to browse into an album, or \`/plex-add-to-queue <number>\` to add a track from an album._`,
            ephemeral: true,
          };
        } else if (session.level === "albums") {
          // Browse into album's tracks
          const artistName = session.parentQuery || "";
          const tracks = await getAlbumTracksList(plexClient, item.key, artistName, ctx);
          
          if (tracks.length === 0) {
            return { content: `No tracks found in **${item.title}**.`, ephemeral: true };
          }

          // Keep session at albums level for context, but allow add-to-queue
          const newSession: ListSession = {
            guildId: ctx.guildId,
            channelId: ctx.channelId,
            level: "tracks",
            items: tracks,
            parentQuery: item.title,
            createdAt: Date.now(),
          };
          setListSession(ctx, newSession);

          const display = formatListDisplay(tracks, "tracks");
          return {
            content: `${display}\n\n**Tracks in ${item.title}**\n_Use \`/plex-add-to-queue <number>\` to add a track to the queue._`,
            ephemeral: true,
          };
        } else {
          // Already at tracks level - show track info
          const track = item;
          const totalDuration = session.items.reduce((sum, t) => sum + (t.duration || 0), 0);
          const totalTimeFormatted = formatDuration(totalDuration);
          
          return {
            content: `🎵 **${track.title}**\n` +
              `**Artist:** ${track.artist || "Unknown"}\n` +
              `**Album:** ${session.parentQuery || "Unknown"}\n` +
              `**Duration:** ${track.subtitle}\n\n` +
              `_Use \`/plex-add-to-queue <number>\` to add to queue._`,
            ephemeral: true,
          };
        }
      }

      // Case 3: Has query but no number - search and show results
      if (query && !itemNumber) {
        // First check if query matches an artist in the library
        const artists = await getArtists(plexClient, sectionsKey, ctx);
        const matchedArtist = artists.find(a => 
          a.title.toLowerCase().includes(query.toLowerCase())
        );

        if (matchedArtist) {
          // Found artist - show its albums
          const albums = await getArtistAlbums(plexClient, matchedArtist.key, ctx);
          
          if (albums.length === 0) {
            return { content: `No albums found for **${matchedArtist.title}**.`, ephemeral: true };
          }

          const newSession: ListSession = {
            guildId: ctx.guildId,
            channelId: ctx.channelId,
            level: "albums",
            items: albums,
            parentQuery: matchedArtist.title,
            createdAt: Date.now(),
          };
          setListSession(ctx, newSession);

          const display = formatListDisplay(albums, "albums");
          return {
            content: `${display}\n\n**Albums by ${matchedArtist.title}**\n_Use \`/plex-list <number>\` to browse into an album._`,
            ephemeral: true,
          };
        }

        // Try to match album
        for (const artist of artists) {
          const albums = await getArtistAlbums(plexClient, artist.key, ctx);
          const matchedAlbum = albums.find(a => 
            a.title.toLowerCase().includes(query.toLowerCase())
          );
          
          if (matchedAlbum) {
            // Found album - show its tracks
            const tracks = await getAlbumTracksList(plexClient, matchedAlbum.key, artist.title, ctx);
            
            if (tracks.length === 0) {
              return { content: `No tracks found in **${matchedAlbum.title}**.`, ephemeral: true };
            }

            const newSession: ListSession = {
              guildId: ctx.guildId,
              channelId: ctx.channelId,
              level: "tracks",
              items: tracks,
              parentQuery: matchedAlbum.title,
              createdAt: Date.now(),
            };
            setListSession(ctx, newSession);

            const display = formatListDisplay(tracks, "tracks");
            return {
              content: `${display}\n\n**Tracks in ${matchedAlbum.title}**\n_Use \`/plex-add-to-queue <number>\` to add a track to the queue._`,
              ephemeral: true,
            };
          }
        }

        return { content: `No artists or albums found matching **${query}**.`, ephemeral: true };
      }

      // Case 4: Has query and number - browse specific artist by number from artists list
      if (query && itemNumber) {
        const artists = await getArtists(plexClient, sectionsKey, ctx);
        
        // Try to find artist by name first
        const matchedArtist = artists.find(a => 
          a.title.toLowerCase().includes(query.toLowerCase())
        );

        if (matchedArtist) {
          const albums = await getArtistAlbums(plexClient, matchedArtist.key, ctx);
          
          if (albums.length === 0) {
            return { content: `No albums found for **${matchedArtist.title}**.`, ephemeral: true };
          }

          const newSession: ListSession = {
            guildId: ctx.guildId,
            channelId: ctx.channelId,
            level: "albums",
            items: albums,
            parentQuery: matchedArtist.title,
            createdAt: Date.now(),
          };
          setListSession(ctx, newSession);

          const display = formatListDisplay(albums, "albums");
          return {
            content: `${display}\n\n**Albums by ${matchedArtist.title}**\n_Use \`/plex-list <number>\` to browse into an album._`,
            ephemeral: true,
          };
        }

        return { content: `No artist found matching **${query}**.`, ephemeral: true };
      }

      return { content: "Something went wrong. Try using `/plex-list` without arguments.", ephemeral: true };
    } catch (err) {
      ctx.log.error("List command failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        content: "Failed to browse Plex library. Please try again.",
        ephemeral: true,
      };
    }
  },
});

const addToQueueCommand = definePluginCommand({
  name: "plex-add-to-queue",
  description: "Add a track to the queue by its number from the list",
  scope: "guild",
  integrationTypes: ["guild_install"],
  contexts: ["Guild"],
  options: [
    {
      type: ApplicationCommandOptionType.Integer,
      name: "number",
      description: "Track number from the current list",
      required: true,
      min_value: 1,
    },
  ],
  async handler(ctx: CommandContext): Promise<CommandReply> {
    if (!ctx.guildId || !ctx.channelId) {
      return { content: "Use this inside a server channel.", ephemeral: true };
    }

    if (!plexClient || !plexConfig) {
      return {
        content: "Plex is not configured. Ask an admin to set up the Plex connection.",
        ephemeral: true,
      };
    }

    const itemNumber = Number(ctx.options.number || 0);
    const session = await getListSession(ctx);

    if (!session) {
      return { 
        content: "No active list session. Use `/plex-list` first to browse the library.", 
        ephemeral: true 
      };
    }

    // Only allow adding from tracks level
    if (session.level !== "tracks") {
      return { 
        content: `Currently at ${session.level === "artists" ? "artists" : "albums"} level. Use \`/plex-list <number>\` to navigate to tracks.`,
        ephemeral: true 
      };
    }

    const item = session.items.find(i => i.index === itemNumber);
    
    if (!item) {
      return { 
        content: `Invalid track number. Current list has ${session.items.length} tracks.\n\n${formatListDisplay(session.items, "tracks")}`, 
        ephemeral: true 
      };
    }

    try {
      const state = await getGuildState(ctx);
      
      // Check if user is in voice channel (required for adding to queue)
      const voiceStatus = await ctx.voice.status(ctx.guildId);
      if (!voiceStatus.connected) {
        return {
          content: "You need to be in a voice channel. Use `/plex-join` first.",
          ephemeral: true,
        };
      }

      const queuedTrack: QueuedTrack = {
        key: item.key,
        title: item.title,
        artist: item.artist || "Unknown Artist",
        album: session.parentQuery || "",
        thumb: item.thumb || "",
        duration: item.duration || 0,
        queuedBy: ctx.userDisplayName,
        queuedAt: Date.now(),
      };

      // If nothing is playing, start playback immediately
      if (!state.isPlaying) {
        state.currentTrack = queuedTrack;
        state.isPlaying = true;
        await saveGuildState(ctx, state);

        const plexUrl = getPlexUrl();
        const playUrl = `${plexUrl}${item.key}?X-Plex-Token=${plexConfig.token}`;

        await ctx.voice.play({ guildId: ctx.guildId, url: playUrl });
        startPlaybackTracker(ctx, ctx.guildId, item.duration || 0);

        return {
          content: `🎵 Now playing: **${queuedTrack.artist}** - ${queuedTrack.title}`,
        };
      } else {
        // Add to queue
        state.queue.push(queuedTrack);
        await saveGuildState(ctx, state);

        return {
          content: `✅ Added to queue (#${state.queue.length}): **${queuedTrack.artist}** - ${queuedTrack.title}`,
        };
      }
    } catch (err) {
      ctx.log.error("Add to queue failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        content: "Failed to add track to queue. Please try again.",
        ephemeral: true,
      };
    }
  },
});

// ── Guild Feature Definition ────────────────────────────────────────────────────

const musicCapability = definePluginCapability({
  key: "manage",
  description: "Manage Plex playback and queue",
});

const musicFeature = defineGuildFeature({
  key: "music",
  name: "Music",
  icon: "musical-note",
  description: "Search and play music from your Plex library",
  enabledByDefault: true,
  commands: [
    playCommand,
    pauseCommand,
    resumeCommand,
    skipCommand,
    stopCommand,
    queueCommand,
    clearqueueCommand,
    removeCommand,
    volumeCommand,
    nowplayingCommand,
    searchCommand,
    listCommand,
    addToQueueCommand,
    joinCommand,
    leaveCommand,
    helpCommand,
  ],
});

// ── Playback Auto-Leave Logic ─────────────────────────────────────────────────

interface PlaybackTracker {
  /** Interval handle for polling playback status */
  intervalHandle: ReturnType<typeof setInterval>;
  /** Guild ID */
  guildId: string;
  /** Timestamp when current track started playing */
  startedAt: number;
  /** Expected duration of current track in ms */
  duration: number;
}

/** Active playback trackers keyed by guildId */
const playbackTrackers = new Map<string, PlaybackTracker>();

/**
 * Interface that both CommandContext and PluginContext satisfy.
 * Used to abstract the common functionality needed by the playback tracker.
 */
interface PlaybackContext {
  voice: {
    status(guildId: string): Promise<{ connected: boolean; playing: boolean }>;
    play(opts: { guildId: string; url: string }): Promise<unknown>;
    leave(guildId: string): Promise<unknown>;
  };
  kv: {
    guild<T>(guildId: string): {
      get(key: string): Promise<T | null>;
      set(key: string, value: T): Promise<unknown>;
    };
  };
  log: {
    info(message: string, data?: Record<string, unknown>): void;
    error(message: string, data?: Record<string, unknown>): void;
  };
}

/**
 * Start tracking playback for a guild. Polls voice status and
 * automatically leaves the voice channel when playback ends and queue is empty.
 */
function startPlaybackTracker(ctx: PlaybackContext, guildId: string, duration: number): void {
  // Clear any existing tracker for this guild
  stopPlaybackTracker(guildId);

  const startedAt = Date.now();

  const handle = setInterval(async () => {
    try {
      const status = await ctx.voice.status(guildId);
      const state = await getGuildStateFromPlaybackContext(ctx, guildId);

      // Calculate expected end time
      const expectedEndTime = startedAt + duration;

      // Check if playback should have ended:
      // 1. Bot is not connected, OR
      // 2. Bot is connected but not playing, OR
      // 3. Expected playback time has passed (with 2 second buffer)
      if (!status.connected || !status.playing || Date.now() > expectedEndTime + 2000) {
        // Check if queue has next track
        if (state.queue.length > 0) {
          // There's a next track in queue - play it
          const nextTrack = state.queue.shift()!;
          state.currentTrack = nextTrack;
          state.isPlaying = true;
          state.isPaused = false;
          await saveGuildStateFromPlaybackContext(ctx, guildId, state);

          const plexUrl = getPlexUrl();
          const playUrl = `${plexUrl}${nextTrack.key}?X-Plex-Token=${plexConfig!.token}`;

          ctx.log.info("Playing next track from queue", {
            title: nextTrack.title,
            artist: nextTrack.artist,
            playUrl,
          });

          await ctx.voice.play({ guildId, url: playUrl });

          // Restart tracker for new track (this replaces current tracker)
          startPlaybackTracker(ctx, guildId, nextTrack.duration);
          return; // Don't continue in the old interval
        } else {
          // Queue is empty - playback finished, leave the channel
          ctx.log.info("Playback finished and queue empty, leaving voice channel");
          try {
            await ctx.voice.leave(guildId);
          } catch {
            // Ignore errors if already disconnected
          }

          // Clear state
          state.isPlaying = false;
          state.isPaused = false;
          state.currentTrack = null;
          await saveGuildStateFromPlaybackContext(ctx, guildId, state);

          // Stop the tracker
          stopPlaybackTracker(guildId);
          return;
        }
      }
    } catch (err) {
      ctx.log.error("Error in playback tracker", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, 3000); // Poll every 3 seconds

  playbackTrackers.set(guildId, {
    intervalHandle: handle,
    guildId,
    startedAt,
    duration,
  });

  ctx.log.info("Started playback tracker", { guildId, duration });
}

/** Stop tracking playback for a guild */
function stopPlaybackTracker(guildId: string): void {
  const tracker = playbackTrackers.get(guildId);
  if (tracker) {
    clearInterval(tracker.intervalHandle);
    playbackTrackers.delete(guildId);
  }
}

/**
 * Get guild state using the playback context interface.
 */
async function getGuildStateFromPlaybackContext(
  ctx: PlaybackContext,
  guildId: string,
): Promise<GuildState> {
  const kv = ctx.kv.guild<GuildState>(guildId);
  const state = await kv.get("state");
  if (state) return state;

  // Initialize default state
  const newState: GuildState = {
    queue: [],
    currentTrack: null,
    isPlaying: false,
    isPaused: false,
    volume: plexConfig?.defaultVolume ?? 0.2,
    repeatMode: "off",
  };
  await kv.set("state", newState);
  return newState;
}

/**
 * Save guild state using the playback context interface.
 */
async function saveGuildStateFromPlaybackContext(
  ctx: PlaybackContext,
  guildId: string,
  state: GuildState,
): Promise<void> {
  const kv = ctx.kv.guild<GuildState>(guildId);
  await kv.set("state", state);
}

// ── Plugin Definition ─────────────────────────────────────────────────────────

export const plugin = definePlugin({

  key: PLUGIN_KEY,
  name: "Karyl Plex",
  version: "0.1.0",
  description: "Search and play music from your Plex library",

  storage: { guildKv: true },

  rpcMethodsUsed: [
    "voice.join",
    "voice.leave",
    "voice.play",
    "voice.pause",
    "voice.stop",
    "voice.status",
    "messages.send",
  ],

  // Configuration schema for admin UI
  configSchema: [
    {
      key: "plex_hostname",
      type: "text" as const,
      label: "Plex Server Hostname",
      description: "IP address or hostname of your Plex Media Server",
      required: true,
    },
    {
      key: "plex_port",
      type: "number" as const,
      label: "Plex Server Port",
      description: "Plex server port (default: 32400)",
      default: 32400,
    },
    {
      key: "plex_token",
      type: "text" as const,
      label: "Plex Authentication Token",
      description: "Your Plex authentication token",
      required: true,
    },
    {
      key: "plex_username",
      type: "text" as const,
      label: "Plex Username",
      description: "Your Plex username (optional, for authentication)",
      required: false,
    },
    {
      key: "plex_password",
      type: "secret" as const,
      label: "Plex Password",
      description: "Your Plex password (optional, for authentication)",
      required: false,
    },
    {
      key: "plex_sections_key",
      type: "text" as const,
      label: "Plex Sections Key",
      description: "The key for your music library section (from /library/sections)",
      required: false,
    },
    {
      key: "default_volume",
      type: "number" as const,
      label: "Default Volume",
      description: "Default playback volume (0-100, default: 20)",
      default: 20,
      min: 0,
      max: 100,
    },
  ],

  capabilities: [musicCapability],

  guildFeatures: [musicFeature],

  async onStart(ctx: PluginContext): Promise<void> {
    // Load Plex configuration
    const config = loadConfig();
    plexConfig = config;
    plexClient = initPlexClient(config);

    ctx.log.info("karyl-plex plugin started", {
      hostname: config.hostname,
      port: config.port,
    });
  },

  async onStop(ctx: PluginContext): Promise<void> {
    ctx.log.info("karyl-plex plugin stopped");
  },

  async onEnable(ctx: PluginContext, guildId: string): Promise<void> {
    ctx.log.info("karyl-plex enabled in guild", { guildId });
  },

  async onDisable(ctx: PluginContext, guildId: string): Promise<void> {
    // Clean up voice when disabled
    try {
      await ctx.voice.leave(guildId);
    } catch {
      // Ignore errors during cleanup
    }

    // Clear guild state
    const state = await getGuildStateFromPlugin(ctx, guildId);
    state.queue = [];
    state.currentTrack = null;
    state.isPlaying = false;
    state.isPaused = false;
    await saveGuildStateFromPlugin(ctx, guildId, state);

    ctx.log.info("karyl-plex disabled in guild", { guildId });
  },

  async healthCheck(): Promise<{ status: "healthy"; message: string }> {
    return {
      status: "healthy",
      message: "Plex plugin nominal",
    };
  },
});
