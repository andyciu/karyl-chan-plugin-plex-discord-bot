declare module "plex-api" {
  interface PlexApiOptions {
    hostname: string;
    port?: number;
    username?: string;
    password?: string;
    token?: string;
    options?: {
      identifier?: string;
      product?: string;
      version?: string;
      deviceName?: string;
      platform?: string;
      device?: string;
    };
  }

  interface QueryResult {
    MediaContainer?: {
      Metadata?: Record<string, unknown>[];
      size?: number | string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  class PlexApi {
    constructor(options: PlexApiOptions);
    query<T = QueryResult>(url: string): Promise<T>;
    on(
      event: string,
      callback: (...args: unknown[]) => void
    ): this;
    removeListener(
      event: string,
      callback: (...args: unknown[]) => void
    ): this;
  }

  namespace PlexApi {
    type Client = InstanceType<typeof PlexApi>;
  }

  export = PlexApi;
}