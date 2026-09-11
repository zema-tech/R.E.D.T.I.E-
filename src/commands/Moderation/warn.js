import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getColor } from '../../config/bot.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logModerationAction, logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn management: add, list or clear user warnings")
        .addSubcommand((s) =>
            s
                .setName("add")
                .setDescription("Warn a user")
                .addUserOption((o) =>
                    o
                        .setName("target")
                        .setRequired(true)
                        .setDescription("User to warn"),
                )
                .addStringOption((o) =>
                    o
                        .setName("reason")
                        .setRequired(true)
                        .setDescription("Reason for the warning"),
                ),
        )
        .addSubcommand((s) =>
            s
                .setName("list")
                .setDescription("View all warnings for a user")
                .addUserOption((o) =>
                    o
                        .setName("target")
                        .setRequired(true)
                        .setDescription("User to check warnings for"),
                ),
        )
        .addSubcommand((s) =>
            s
                .setName("clear")
                .setDescription("Clear all warnings for a user")
                .addUserOption((o) =>
                    o
                        .setName("target")
                        .setRequired(true)
                        .setDescription("User to clear warnings for"),
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case "add":
                return handleAdd(interaction, config, client);
            case "list":
                return handleList(interaction, config, client);
            case "clear":
                return handleClear(interaction, config, client);
            default:
                throw new TitanBotError(
                    'Unknown subcommand',
                    ErrorTypes.USER_INPUT,
                    'Unknown warn subcommand. Use add, list or clear.',
                );
        }
    },
};

async function handleAdd(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Warn interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'warn'
        });
        return;
    }

    const target = interaction.options.getUser("target");
    const member = interaction.options.getMember("target");
    const reason = interaction.options.getString("reason");
    const moderator = interaction.user;
    const guildId = interaction.guildId;

    if (!target) {
        throw new TitanBotError(
            'Missing target user',
            ErrorTypes.USER_INPUT,
            'You must specify a user to warn.',
            { subtype: 'invalid_user' },
        );
    }

    if (!reason) {
        throw new TitanBotError(
            'Missing warning reason',
            ErrorTypes.VALIDATION,
            'You must provide a reason for the warning.',
            { subtype: 'missing_required' },
        );
    }

    if (!member) {
        throw new TitanBotError(
            "Target not found",
            ErrorTypes.USER_INPUT,
            "The target user is not currently in this server."
        );
    }

    ModerationService.assertModerationHierarchy(interaction.member, member, 'warn');

    const { id, totalCount } = await WarningService.addWarning({
        guildId,
        userId: target.id,
        moderatorId: moderator.id,
        reason,
        timestamp: Date.now()
    });

    await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
            action: "User Warned",
            target: `${target.tag} (${target.id})`,
            executor: `${moderator.tag} (${moderator.id})`,
            reason,
            metadata: {
                userId: target.id,
                moderatorId: moderator.id,
                totalWarns: totalCount,
                warningNumber: totalCount,
                warningId: id
            }
        }
    });

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                `⚠️ **Warned** ${target.tag}`,
                `**Reason:** ${reason}\n**Total Warns:** ${totalCount}`,
            ),
        ],
    });
}

async function handleList(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Warnings interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'warnings',
        });
        return;
    }

    const target = interaction.options.getUser("target");
    const guildId = interaction.guildId;

    const validWarnings = await WarningService.getWarnings(guildId, target.id);
    const totalWarns = validWarnings.length;

    if (totalWarns === 0) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: `Warnings: ${target.tag}`,
                    description: "This user has no recorded warnings.",
                }).setColor(getColor('success')),
            ],
        });
        return;
    }

    const embed = createEmbed({
        title: `Warnings: ${target.tag}`,
        description: `Total Warnings: **${totalWarns}**`,
    }).setColor(getColor('warning'));

    const warningFields = validWarnings
        .map((w, i) => {
            const discordTimestamp = Math.floor(w.timestamp / 1000);
            return {
                name: `[#${i + 1}] Reason: ${w.reason.substring(0, 100)}`,
                value: `**Moderator:** <@${w.moderatorId}>\n**Date:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                inline: false,
            };
        })
        .slice(0, 25);

    embed.addFields(warningFields);

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`warning_delete_specific:${target.id}:${interaction.user.id}`)
            .setLabel('Delete Specific Warning')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`warning_clear_all:${target.id}:${interaction.user.id}`)
            .setLabel('Clear All Warnings')
            .setStyle(ButtonStyle.Danger),
    );

    await logEvent({
        client,
        guild: interaction.guild,
        event: {
            action: "Warnings Viewed",
            target: `${target.tag} (${target.id})`,
            executor: `${interaction.user.tag} (${interaction.user.id})`,
            reason: `Viewed ${totalWarns} warnings`,
            metadata: {
                userId: target.id,
                moderatorId: interaction.user.id,
                totalWarnings: totalWarns,
            },
        },
    });

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [actionRow] });
}

async function handleClear(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Warn clear interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'warn'
        });
        return;
    }

    const target = interaction.options.getUser("target");
    const guildId = interaction.guildId;

    if (!target) {
        throw new TitanBotError(
            'Missing target user',
            ErrorTypes.USER_INPUT,
            'You must specify a user to clear warnings for.',
            { subtype: 'invalid_user' },
        );
    }

    const { count } = await WarningService.clearWarnings(guildId, target.id);

    logger.info(`[MODERATION] All warnings cleared for ${target.id} in ${guildId} by ${interaction.user.id}`);

    if (count === 0) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: `Warnings: ${target.tag}`,
                    description: "This user has no recorded warnings.",
                }).setColor(getColor('success')),
            ],
        });
        return;
    }

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed('✅ Warnings Cleared', `All warnings for **${target.tag}** have been cleared. **${count}** warning(s) removed.`),
        ],
    });
}
