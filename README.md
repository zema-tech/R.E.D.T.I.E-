# TitanBot - Professional Discord Community Bot

**TitanBot** is a self-hosted Discord bot for professional community management: moderation, support tickets with AI assistance, verification, giveaways, utilities, and music. Built with Discord.js v14 and PostgreSQL. Multi-guild with fully isolated per-server data.

[![Support Server](https://img.shields.io/badge/-Support%20Server-%235865F2?logo=discord&logoColor=white&style=flat-square&logoWidth=20)](https://discord.gg/8kJBYhTGW9)
[![Discord.js](https://img.shields.io/npm/v/discord.js?style=flat-square&labelColor=%23202225&color=%23202225&logo=npm&logoColor=white&logoWidth=20)](https://www.npmjs.com/package/discord.js)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-%23336791?logo=postgresql&logoColor=white&style=flat-square&logoWidth=20)

## Table of Contents

- [Features Overview](#features-overview)
- [Quick Setup](#quick-setup)
- [Manual Installation Steps](#manual-installation-steps)
- [AI Assistant (Groq)](#ai-assistant-groq)
- [Music](#music)
- [Command Migration (v3)](#command-migration-v3)
- [Support Server](https://discord.gg/QnWNz2dKCE)
- [Required Bot Intents](#bot-intents)
- [Contributing](CONTRIBUTING.md)

<a name="features-overview"></a>
## Features Overview

<table>
<tr>
<td width="50%" valign="top">

### Moderation & Administration
- **Full toolkit** - `/ban`, `/kick`, `/timeout`, `/warn`, `/lock`, `/purge`, `/dm`, `/say` (each with subcommands, e.g. `/ban add|remove|mass`)
- **Notes & cases** - Unified `/notes` history per user
- **Abuse protection** - Rate limiting on risky commands

### AI Ticket System
- **Panels & dashboards** - Setup, claim, priority, close, transcripts
- **AI summaries** - `/ticket summarize` for staff handoff
- **AI reply drafts** - `/ticket suggest` (review before sending)
- **Auto-moderation** - Ticket message scans with configurable sensitivity
- **Feedback loop** - Rate AI outputs, track accuracy with `/ticket ai-stats`

### Server Stats
- **Member Counter** - Live member count channels
- **Voice Counters** - Track voice stats
- **Dynamic Updates** - Real-time channel updates

### Reaction Roles
- **Role Assignment** - Self-assignable roles
- **Emoji Selection** - Reaction-based system
- **Multi-role Support** - Multiple role options

</td>
<td width="50%" valign="top">

### Giveaways & Events
- **Multiple Winners** - Support multi-winner giveaways
- **Auto Picking** - Automatic winner selection
- **Reroll System** - Pick new winners if needed

### Birthday System
- **Birthday Tracking** - Never miss a birthday
- **Auto Announcements** - Celebrate automatically
- **Timezone Support** - Accurate worldwide tracking

### Utility Tools
- **Report System** - Report issues to staff
- **Todo Lists** - Personal task management
- **Calculator, Weather, Polls** - Everyday utilities
- **Search** - Dictionary, Urban Dictionary, web

### Welcome & Verification
- **Welcome Messages** - Greet new members
- **Auto Roles** - Assign roles on join
- **Verification Flow** - Button + auto-verify

### Music
- **Full controls** - `/music play|queue|nowplaying|join|skip|previous|autoplay|loop|shuffle|seek|volume|247`
- **24/7 Mode** - Stay connected when idle
- **Autoplay** - Related tracks when the queue ends
- **Error recovery** - Broken tracks are skipped automatically

</td>
</tr>
</table>

> **Removed in v3:** Economy, Leveling/XP and Shop were removed to focus the bot on moderation, tickets, utility and music. Legacy data is cleaned automatically via `/wipedata`; leftover tables will be dropped in a future release.

<a name="quick-setup"></a>
## Quick Setup (Recommended for non-coders)

### Video Tutorial
For a detailed step-by-step setup guide, watch our comprehensive video tutorial:
[**TitanBot Setup Tutorial**](https://www.youtube.com/@TouchDisc)

## Docker Deployment (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/zema-tech/R.E.D.T.I.E-.git
   cd R.E.D.T.I.E-
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Set at minimum `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`. Docker Compose also reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` from `.env` (defaults: `titanbot` / `password` / `titanbot`).

3. **Build and start the containers:**
   ```bash
   docker compose up -d --build
   ```

4. **Check status:**
   ```bash
   docker compose ps
   curl http://localhost:3000/health
   ```

This starts the bot and PostgreSQL. The compose file sets `POSTGRES_SSL=false` and `AUTO_MIGRATE=true` for the bundled database. Music uses public Lavalink v4 nodes from `lavalink/nodes.json` by default.

<a name="ai-assistant-groq"></a>
### AI Assistant (Groq)

Ticket AI features (summaries, reply drafts, auto-moderation) need a free Groq API key from [console.groq.com](https://console.groq.com):

```env
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant
AI_TICKET_ASSISTANT=true
AI_TICKET_MODERATION=true
AI_SENSITIVITY=balanced
```

Without a key every AI feature reports "not configured" and the rest of the bot works normally. Per-server overrides: `/ticket ai-config`. Tune sensitivity from staff feedback: `/ticket ai-stats`.

### Music

Music uses [Lavalink v4](https://github.com/lavalink-devs/Lavalink) via [Riffy](https://github.com/riffy-rb/riffy).

1. By default, the bot loads multiple public v4 SSL nodes from [`lavalink/nodes.json`](lavalink/nodes.json) (sourced from [lavalink.darrennathanael.com](https://lavalink.darrennathanael.com/SSL/Lavalink-SSL/)). Edit that file to add or remove nodes.
2. To self-host Lavalink instead (recommended for reliability), run `docker compose --profile local-lavalink up -d` and set single-node env vars in `.env`:
   ```env
   LAVALINK_HOST=lavalink
   LAVALINK_PORT=2333
   LAVALINK_PASSWORD=youshallnotpass
   LAVALINK_SECURE=false
   ```
   Remove or rename `lavalink/nodes.json` so the bot falls back to those env vars.
3. Override nodes inline with `LAVALINK_NODES` (JSON array) or point at another file with `LAVALINK_NODES_FILE`.
4. Use `/music play <song>` from a voice channel. Full control list: `/music queue|nowplaying|join|skip|previous|autoplay|pause|resume|stop|shuffle|loop|volume|seek|remove|move|clear|leave|247`.

### Using GitHub Container Registry

The bot is automatically published to GitHub Container Registry on every push to main.

```bash
docker pull ghcr.io/zema-tech/R.E.D.T.I.E-:main
```

<a name="manual-installation-steps"></a>
## Manual Installation Steps

### Prerequisites
- Node.js 20.10.0 or higher
- PostgreSQL server (recommended) or memory storage fallback
- Discord bot application with proper intents
- (Optional) Groq API key for ticket AI features

1. **Clone the Repository**
   ```bash
   git clone https://github.com/zema-tech/R.E.D.T.I.E-.git
   cd R.E.D.T.I.E-
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration (only the following variables require configuration, leave remaining variables as default):
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_client_id_here
   GUILD_ID=your_discord_guild_id_here

   # PostgreSQL Configuration (Primary Database)
   POSTGRES_URL=postgresql://postgres:yourpassword@localhost:5432/titanbot
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=titanbot
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=yourpassword

   # AI Assistant (optional — ticket summarize/suggest/moderation)
   GROQ_API_KEY=
   ```

   Production note:
   - `NODE_ENV=production`
   - `LOG_LEVEL=warn` for a clean production console (critical issues + startup status)
   - `LOG_LEVEL=info` if you want more detailed operational logs
   - If your chosen `PORT` is already used, TitanBot automatically tries the next port(s)

   Environment options reference:
   - `NODE_ENV`: `development`, `production`, `test` (any non-`production` value is treated as non-production)
   - `LOG_LEVEL`: `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`

   Recommended production `.env` (easy mode + default mode):
   ```env
   NODE_ENV=production
   LOG_LEVEL=warn
   WEB_HOST=0.0.0.0
   PORT=3000
   PORT_RETRY_ATTEMPTS=5
   ```
   This gives clear startup/online status messages while keeping logs simple for non-technical operators.
   If port `3000` is busy, the bot tries the next available ports automatically (up to `PORT_RETRY_ATTEMPTS`).

### Multiple servers

Slash commands are registered **globally** on startup (via `CLIENT_ID`), so the bot works in every server it is invited to. `GUILD_ID` stays in the tutorial `.env` for setup steps but is not used for command registration.

Notes:
- Global slash commands may take up to about an hour to propagate on first deploy
- Each server has **isolated** data: config, tickets, dashboards, warnings, etc. (all keys are scoped as `guild:{guildId}:...`)
- In the [Discord Developer Portal](https://discord.com/developers/applications), ensure your bot is not restricted to a single guild if you plan to invite it elsewhere
- Generate an OAuth2 invite URL from the [Discord Developer Portal](https://discord.com/developers/applications) (OAuth2 → URL Generator, scopes: `bot` and `applications.commands`)

4. **Setup PostgreSQL Database** (Optional but recommended)
   ```bash
   # Create database and user
   createdb titanbot
   createuser titanbot
   psql -c "ALTER USER titanbot PASSWORD 'yourpassword';"
   psql -c "GRANT ALL PRIVILEGES ON DATABASE titanbot TO titanbot;"
   ```

5. **Verify Database Setup**
   ```bash
   npm run migrate:check
   ```

6. **Start the Bot**
   ```bash
   npm start
   ```

## Development

```bash
npm test        # vitest suite (utils, parsers, rate limiter, counting game)
npm run lint    # ESLint quality gate — must be clean before pushing
```

CI (`.github/workflows/ci.yml`) runs `npm ci` + lint + test on every push/PR to `main`. Brand rules for new commands live in [docs/brand-guidelines.md](docs/brand-guidelines.md).

> **Note on database migrations:** Schema tables and legacy key migrations run
> **automatically on startup**, so managed hosts like **Railway** need no manual
> migration step — just deploy/restart. To disable auto-migration set
> `AUTO_MIGRATE=false`. You can still run a manual key migration locally with
> `node scripts/migrate-keys.js --dry-run` (preview) or `node scripts/migrate-keys.js`.
<a name="command-migration-v3"></a>

## Command Migration (v3)

v3 consolidates duplicate commands into subcommands. Old names stop working once Discord refreshes global commands (up to ~1h after deploy):

| Before | After |
|---|---|
| `/warnings`, `/usernotes view`, `/cases` | `/warn list`, `/notes list`, `/notes cases` |
| `/unban` | `/ban remove` |
| `/massban` | `/ban mass` |
| `/kick` + `/masskick` | `/kick single`, `/kick mass` |
| `/untimeout` | `/timeout remove` |
| `/unlock` | `/lock unlock` |
| `/play`, `/join`, `/queue`, `/nowplaying` | `/music play|join|queue|nowplaying` |
| `/close`, `/claim`, `/priority` | `/ticket close|claim|priority` |
| `/verification` (admin) | `/verification-setup` |
| `/greet` | `/welcome` |
| `/unixtime` | `/time` (includes unix timestamp) |
| `/flip`, `/roll`, `/fight`, `/hexcolor`, `/baseconvert`, `/randomuser`, `/firstmsg` | Removed |

<a name="bot-intents"></a>

## Required Bot Intents
TitanBot requires the following Discord intents:
- **Guilds**
- **Guild Messages**
- **Message Content**
- **Guild Members**
- **Guild Message Reactions**
- **Guild Voice States**
- **Direct Messages**
- **Bot**
- **Applications.commands**

### Required Permissions
- **View Channels**
- **Send Messages**
- **Embed Links**
- **Attach Files**
- **Read Message History**
- **Manage Messages**
- **Manage Channels**
- **Manage Roles**
- **Kick Members**
- **Ban Members**
- **Moderate Members**
- **Connect**

## License

TitanBot is released under the MIT License. See [LICENSE](LICENSE) for details.

## Thank You

Thank you for choosing TitanBot for your Discord server! We're constantly working to improve and add new features based on community feedback.

*Last updated: September 2026*
