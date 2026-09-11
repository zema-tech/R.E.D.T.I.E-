import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick management: kick a single user or many at once")
        .addSubcommand((s) =>
            s
                .setName("single")
                .setDescription("Kick a user from the server")
                .addUserOption((option) =>
                    option
                        .setName("target")
                        .setDescription("The user to kick")
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option.setName("reason").setDescription("Reason for the kick"),
                ),
        )
        .addSubcommand((s) =>
            s
                .setName("mass")
                .setDescription("Kick multiple users from the server at once")
                .addStringOption(option =>
                    option
                        .setName("users")
                        .setDescription("User IDs or mentions to kick (separated by spaces or commas)")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Reason for the mass kick")
                        .setRequired(false)
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case "single":
                return handleSingle(interaction, config, client);
            case "mass":
                return handleMass(interaction, config, client);
            default:
                throw new TitanBotError(
                    'Unknown subcommand',
                    ErrorTypes.USER_INPUT,
                    'Unknown kick subcommand. Use single or mass.',
                );
        }
    },
};

async function handleSingle(interaction, config, client) {
    const targetUser = interaction.options.getUser("target");
    const member = interaction.options.getMember("target");
    const reason = interaction.options.getString("reason") || "No reason provided";

    if (!targetUser) {
        throw new TitanBotError(
            'Missing target user',
            ErrorTypes.USER_INPUT,
            'You must specify a user to kick.',
            { subtype: 'invalid_user' },
        );
    }

    if (targetUser.id === interaction.user.id) {
        throw new TitanBotError(
            "Cannot kick self",
            ErrorTypes.VALIDATION,
            "You cannot kick yourself.",
        );
    }

    if (targetUser.id === client.user.id) {
        throw new TitanBotError(
            "Cannot kick bot",
            ErrorTypes.VALIDATION,
            "You cannot kick the bot.",
        );
    }

    if (!member) {
        throw new TitanBotError(
            "Target not found",
            ErrorTypes.USER_INPUT,
            "The target user is not currently in this server.",
            { subtype: 'user_not_found' },
        );
    }

    const result = await ModerationService.kickUser({
        guild: interaction.guild,
        member,
        moderator: interaction.member,
        reason,
    });

    await InteractionHelper.universalReply(interaction, {
        embeds: [
            successEmbed(
                `👢 **Kicked** ${targetUser.tag}`,
                `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
            ),
        ],
    });
}

async function handleMass(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Masskick interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'masskick'
        });
        return;
    }

    const usersInput = interaction.options.getString("users");
    const reason = interaction.options.getString("reason") || "Mass kick - No reason provided";

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
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot include yourself in a mass kick.' });
        }

        if (userIds.includes(client.user.id)) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'You cannot include the bot in a mass kick.' });
        }

        const results = {
            successful: [],
            failed: [],
            skipped: []
        };

        for (const userId of userIds) {
            try {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);

                if (!member) {
                    results.failed.push({ userId, reason: "User not in server" });
                    continue;
                }

                const modCheck = ModerationService.validateHierarchy(interaction.member, member, 'kick');
                if (!modCheck.valid) {
                    results.skipped.push({
                        user: member.user.tag,
                        userId,
                        reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'kick'),
                    });
                    continue;
                }

                const botCheck = ModerationService.validateBotHierarchy(member, 'kick');
                if (!botCheck.valid) {
                    results.skipped.push({
                        user: member.user.tag,
                        userId,
                        reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'kick', 'bot'),
                    });
                    continue;
                }

                if (!member.kickable) {
                    results.skipped.push({
                        user: member.user.tag,
                        userId,
                        reason: 'Target has Admin or a managed role, or bot lacks Kick Members',
                    });
                    continue;
                }

                await member.kick(reason);

                results.successful.push({
                    user: member.user.tag,
                    userId
                });

                await logModerationAction({
                    client,
                    guild: interaction.guild,
                    event: {
                        action: "Member Kicked",
                        target: `${member.user.tag} (${member.user.id})`,
                        executor: `${interaction.user.tag} (${interaction.user.id})`,
                        reason: `${reason} (Mass Kick)`,
                        metadata: {
                            userId: member.user.id,
                            moderatorId: interaction.user.id,
                            massKick: true
                        }
                    }
                });

            } catch (error) {
                logger.error(`Failed to kick user ${userId}:`, error);
                const reason = error instanceof TitanBotError
                    ? (error.userMessage || error.message)
                    : (error.message || "Unknown error");
                results.failed.push({
                    userId,
                    reason,
                });
            }
        }

        let description = `**Mass Kick Results:**\n\n`;

        if (results.successful.length > 0) {
            description += `✅ **Successfully Kicked (${results.successful.length}):**\n`;
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
                    `👢 Mass Kick Completed`,
                    description
                )
            ]
        });

    } catch (error) {
        logger.error("Error in masskick command:", error);
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while processing the mass kick. Please try again later.' });
    }
}
