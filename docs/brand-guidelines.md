# Brand Guidelines — TitanBot (R.E.D.T.I.E-)

> Source of truth for bot identity, voice and visual system.
> Design tokens live in `src/config/bot.js` (`embeds.colors`);
> embed factory in `src/utils/embeds.js`.

## 1. Identity

- **Name:** TitanBot
- **Role:** Professional community-management bot for Discord (moderation,
  tickets, verification, music, utilities).
- **Personality:** Calm authority. A reliable staff member, never a clown.
  Confident, concise, helpful. No slang, no threats, no guilt-tripping.

## 2. Voice & Messaging

- User-facing strings: short, neutral, actionable. State what happened +
  what to do next. ("You're on cooldown. Try again in 12s.")
- Errors: never blame the user, never leak internals. Use the shared
  `replyUserError` / `*Embed` helpers — never raw text for errors.
- Formatting: one emoji max as visual anchor in titles; no emoji walls.
- Language: English strings in code; per-guild locale only via config.

## 3. Visual Identity (embeds)

- **Color tokens** (`src/config/bot.js`): `primary` brand, `success` /
  `error` / `warning` / `info` status, feature colors (`ticket.*`,
  `birthday`, `moderation`, `giveaway.*`, `priority.*`).
  Always reference tokens via `getColor(name)` — never hardcode hex.
- **Structure:** title (≤256) → description → fields (≤25) → footer +
  timestamp. `createEmbed` applies footer `Titan Bot` + timestamp by default.
- **Sanitization:** the factory strips emojis from titles/descriptions and
  collapses whitespace — write clean strings, the factory enforces it.
- **Buttons:** max 5/row; destructive actions always behind confirm.

## 4. Presence

- Status `online`, activity Watching `Keeping your community safe`.
  Never joke statuses on production.

## 5. Consistency Checklist (for every new command)

- [ ] Uses `createEmbed` / `successEmbed` / `errorEmbed` / `warningEmbed`
- [ ] Colors only via `getColor()` tokens
- [ ] Errors via `replyUserError` with the right `ErrorTypes`
- [ ] Defer via `InteractionHelper` (no raw `deferReply` on components)
- [ ] `setDefaultMemberPermissions` set; prefix parity checked
- [ ] Help entry auto-generated (no hardcoded category lists)
