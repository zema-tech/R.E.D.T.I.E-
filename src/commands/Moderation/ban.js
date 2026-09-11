import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban management: ban, unban or mass-ban users")
        .addSubcommand((s) =>
            s
                .setName("add")
                .setDescription("Ban a user from the server")
                .addUserOption((option) =>
                    option
                        .setName("target")
                        .setDescription("The user to ban")
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option.setName("reason").setDescription("Reason for the ban"),
                ),
        )
        .addSubcommand((s) =>
            s
                .setName("remove")
                .setDescription("Unban a user from the server")
                .addStringOption(option =>
                    option
                        .setName("target")
                        .setDescription("The ID (or mention) of the user to unban")
                        .setRequired(true),
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Reason for the unban")
                        .setRequired(false),
                ),
        )
        .addSubcommand((s) =>
            s
                .setName("mass")
                .setDescription("Ban multiple users from the server at once")
                .addStringOption(option =>
                    option
                        .setName("users")
                        .setDescription("User IDs or mentions to ban (separated by spaces or commas)")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Reason for the mass ban")
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName("delete_days")
                        .setDescription("Number of days of messages to delete (0-7)")
                        .setMinValue(0)
                        .setMaxValue(7)
                        .setRequired(false)
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case "add":
                return handleAdd(interaction, config, client);
            case "remove":
                return handleRemove(interaction, config, client);
            case "mass":
                return handleMass(interaction, config, client);
            default:
                throw new TitanBotError(
                    'Unknown subcommand',
                    ErrorTypes.USER_INPUT,
                    'Unknown ban subcommand. Use add, remove or mass.',
                );
        }
    },
};

async function handleAdd(interaction, config, client) {
    const user = interaction.options.getUser("target");
    const reason = interaction.options.getString("reason") || "No reason provided";

    if (!user) {
        throw new TitanBotError(
            'Missing target user',
            ErrorTypes.USER_INPUT,
            'You must specify a user to ban.',
            { subtype: 'invalid_user' },
        );
    }

    if (user.id === interaction.user.id) {
        throw new TitanBotError(
            'Cannot ban self',
            ErrorTypes.VALIDATION,
            'You cannot ban yourself.',
        );
    }
    if (user.id === client.user.id) {
        throw new TitanBotError(
            'Cannot ban bot',
            ErrorTypes.VALIDATION,
            'You cannot ban the bot.',
        );
    }

    const result = await ModerationService.banUser({
        guild: interaction.guild,
        user,
        moderator: interaction.member,
        reason,
    });

    await InteractionHelper.universalReply(interaction, {
        embeds: [
            successEmbed(
                `🚫 **Banned** ${user.tag}`,
                `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
            ),
        ],
    });
}

async function handleRemove(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Unban interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'unban',
        });
        return;
    }

    const rawTarget = interaction.options.getString("target");
    const targetId = rawTarget.replace(/[<@!>]/g, '').trim();

    if (!/^\d{17,20}$/.test(targetId)) {
        return replyUserError(interaction, {
            type: ErrorTypes.USER_INPUT,
            message: 'Please provide a valid user ID or mention.',
        });
    }

    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
        return replyUserError(interaction, {
            type: ErrorTypes.USER_INPUT,
            message: `Could not find a user with the ID \`${targetId}\`.`,
        });
    }

    const reason = interaction.options.getString("reason") || "No reason provided";

    const result = await ModerationService.unbanUser({
        guild: interaction.guild,
        user: targetUser,
        moderator: interaction.member,
        reason,
    });

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                "✅ User Unbanned",
                `Successfully unbanned **${targetUser.tag}** from the server.\n\n**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
            ),
        ],
    });
}

async function handleMass(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Massban interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'massban'
        });
        return;
    }

    const usersInput = interaction.options.getString("users");
    const reason = interaction.options.getString("reason") || "Mass ban - No reason provided";
    const deleteDays = interaction.options.getInteger("delete_days") || 0;

    try {
        const userIds = usersInput
.replace(/<@!?(\d+)>/g, '$1')
.split(/[\s,]+/)
.filter(id => id && /^\d+$/.test(id))
.slice(0, 20);

        if (userIds.length === 0) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please provide valid user IDs or mentions. Maximum 20 users at once.' });
        }

        if (userIds.includes(interaction.user.id)) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot include yourself in a mass ban.' });
        }

        if (userIds.includes(client.user.id)) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot include the bot in a mass ban.' });
        }

        const results = {
            successful: [],
            failed: [],
            skipped: []
        };

        for (const userId of userIds) {
            try {
                const user = await client.users.fetch(userId).catch(() => null);

                if (!user) {
                    results.failed.push({ userId, reason: "User not found" });
                    continue;
                }

                const member = await interaction.guild.members.fetch(userId).catch(() => null);

                if (member) {
                    const modCheck = ModerationService.validateHierarchy(interaction.member, member, 'ban');
                    if (!modCheck.valid) {
                        results.skipped.push({
                            user: user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'ban'),
                        });
                        continue;
                    }

                    const botCheck = ModerationService.validateBotHierarchy(member, 'ban');
                    if (!botCheck.valid) {
                        results.skipped.push({
                            user: user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'ban', 'bot'),
                        });
                        continue;
                    }
                }

                await interaction.guild.members.ban(userId, {
                    reason: reason,
                    deleteMessageSeconds: deleteDays * 24 * 60 * 60
                });

                results.successful.push({
                    user: user.tag,
                    userId
                });

                await logModerationAction({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: "Member Banned",
                        target: `${user.tag} (${user.id})`,
                        executor: `${interaction.user.tag} (${interaction.user.id})`,
                        reason: `${reason} (Mass Ban)`,
                        metadata: {
                            userId: user.id,
                            moderatorId: interaction.user.id,
                            massBan: true,
                            permanent: true
                        }
                    }
                });

            } catch (error) {
                logger.error(`Failed to ban user ${userId}:`, error);
                const reason = error instanceof TitanBotError
                    ? (error.userMessage || error.message)
                    : (error.message || "Unknown error");
                results.failed.push({
                    userId,
                    reason,
                });
            }
        }

        let description = `**Mass Ban Results:**\n\n`;

        if (results.successful.length > 0) {
            description += `✅ **Successfully Banned (${results.successful.length}):**\n`;
            results.successful.forEach(result => {
                description += `• ${result.user} (${result.userId})\n`;
            });
            description += '\n';
        }

        if (results.skipped.length > 0) {
            description += `⚠️ **Skipped (${results.skipped.length}):**\n`;
            results.skipped.forEach(result => {
                description += `• ${result.user} - ${result.reason}\n`;
            });
            description += '\n';
        }

        if (results.failed.length > 0) {
            description += `❌ **Failed (${results.failed.length}):**\n`;
            results.failed.forEach(result => {
                description += `• ${result.userId} - ${result.reason}\n`;
            });
        }

        const embed = results.successful.length > 0 ? successEmbed : warningEmbed;

        return await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                embed(
                    `🔨 Mass Ban Completed`,
                    description
                )
            ]
        });

    } catch (error) {
        logger.error("Error in massban command:", error);
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while processing the mass ban. Please try again later.' });
    }
}
