// Per-guild music session state (in-memory). Adapted from Musicify playerStore (Apache-2.0).

export class GuildMusicData {
    constructor() {
        this.playerMessageId = null;
        this.playerChannelId = null;
        this.autoplay = false;
        this.loop = 'none';
        this.volume = 75;
        this.shuffle = false;
        this.previousTracks = [];
        this.twentyFourSeven = false;
        this.queuePages = new Map();
        this.queuePageSeenAt = new Map();
        this.updateInterval = null;
        this.idleTimeout = null;
        this.autoPaused = false;
        this.stopConfirmPending = null;
    }
}

const QUEUE_PAGE_TTL_MS = 15 * 60 * 1000;

// Queue pagination entries are per-user view state: drop stale ones so the
// map cannot grow for the lifetime of the process.
export function setQueuePage(guildData, userId, page) {
    const now = Date.now();
    for (const [key, seenAt] of guildData.queuePageSeenAt) {
        if (now - seenAt > QUEUE_PAGE_TTL_MS) {
            guildData.queuePageSeenAt.delete(key);
            guildData.queuePages.delete(key);
        }
    }
    guildData.queuePages.set(userId, page);
    guildData.queuePageSeenAt.set(userId, now);
}

export function clearUpdateInterval(guildData) {
    if (guildData.updateInterval) {
        clearInterval(guildData.updateInterval);
        guildData.updateInterval = null;
    }
}

const guildStore = new Map();

export function getGuildMusicData(guildId) {
    if (!guildStore.has(guildId)) {
        guildStore.set(guildId, new GuildMusicData());
    }
    return guildStore.get(guildId);
}

export function deleteGuildMusicData(guildId) {
    const guildData = guildStore.get(guildId);
    if (guildData) {
        clearUpdateInterval(guildData);
        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
        }
    }
    guildStore.delete(guildId);
}
