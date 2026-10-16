interface Env {
  DB: D1Database;
  /** clé API Anthropic (secret) : active le coach Claude */
  ANTHROPIC_API_KEY?: string;
  CLAUDE_MODEL?: string;
  ASSETS: Fetcher;
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  /** "1" pour activer la connexion démo (dev local uniquement) */
  DEMO_MODE?: string;
}
