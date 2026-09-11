import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { closeTicket, claimTicket, updateTicketPriority } from '../../services/ticket.js';
import { isAiAvailable } from '../../services/ai/groqClient.js';
import { getAiSettings, setAiSettings } from '../../services/ai/aiConfig.js';
import { summarizeTicket, suggestTicketReply, getAiStats } from '../../services/ai/ticketAi.js';
import { getTicketData } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manages the server's ticket system.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Sets up the ticket creation panel in a specified channel.",
                )
                .addChannelOption((option) =>
                    option
.setName("panel_channel")
                        .setDescription(
                            "The channel where the ticket panel will be sent.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "The main message/description for the ticket panel.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "The label for the ticket creation button (default: Create Ticket)",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "The category where new tickets will be created (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "The category where closed tickets will be moved (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "The role that can access tickets (optional).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximum number of tickets a user can create (default: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Send DM to user when their ticket is closed (default: true)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Open the interactive ticket system dashboard"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("summarize")
                .setDescription("AI summary of this ticket's conversation (staff only, inside a ticket)"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("suggest")
                .setDescription("AI-drafted staff reply for this ticket")
                .addStringOption((option) =>
                    option
                        .setName("hint")
                        .setDescription("Direction for the draft (e.g. 'offer a refund')")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ai-stats")
                .setDescription("Show AI assistant accuracy from staff feedback"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("ai-config")
                .setDescription("Configure the AI assistant for this server")
                .addBooleanOption((option) =>
                    option.setName("assistant").setDescription("Enable /ticket summarize + suggest").setRequired(false),
                )
                .addBooleanOption((option) =>
                    option.setName("moderation").setDescription("Enable automatic ticket moderation scans").setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName("sensitivity")
                        .setDescription("Moderation sensitivity")
                        .setRequired(false)
                        .addChoices(
                            { name: 'Low', value: 'low' },
                            { name: 'Balanced', value: 'balanced' },
                            { name: 'Strict', value: 'strict' },
                        ),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("close")
                .setDescription("Close the current ticket")
                .addStringOption((option) =>
                    option
                        .setName("reason")
                        .setDescription("The reason for closing the ticket")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("claim")
                .setDescription("Claim this ticket, assigning it to you"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("priority")
                .setDescription("Set the priority level for the current ticket")
                .addStringOption((option) =>
                    option
                        .setName("level")
                        .setDescription("The priority level for the ticket")
                        .setRequired(true)
                        .addChoices(
                            { name: "Urgent", value: "urgent" },
                            { name: "High", value: "high" },
                            { name: "Medium", value: "medium" },
                            { name: "Low", value: "low" },
                            { name: "None", value: "none" },
                        ),
                ),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        // Ticket-channel operations keep their own per-subcommand permission
        // checks (staff role / ticket creator), NOT the ManageChannels gate below.
        if (subcommand === "close" || subcommand === "claim" || subcommand === "priority") {
            return executeTicketOpSubcommand(interaction, client, subcommand);
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Ticket command permission denied', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission for this action.' });
        }

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "summarize" || subcommand === "suggest" || subcommand === "ai-stats" || subcommand === "ai-config") {
            return executeAiSubcommand(interaction, client, subcommand);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `This server already has a ticket system set up (panel in <#${existingConfig.ticketPanelChannelId}>).\n\nOnly one ticket system is supported per server. Use \`/ticket dashboard\` to edit or update the existing setup, or select **Delete System** from the dashboard to remove it and start fresh.` });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel");
            const categoryChannel = interaction.options.getChannel("category");
            const closedCategoryChannel = interaction.options.getChannel("closed_category");
            const staffRole = interaction.options.getRole("staff_role");
const panelMessage = interaction.options.getString("panel_message") || "Click the button below to create a support ticket.";
            const buttonLabel =
                interaction.options.getString("button_label") ||
"Create Ticket";
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

            const setupEmbed = createEmbed({ 
                title: "Support Tickets", 
description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
.setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;
                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                    currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.info('Ticket configuration saved', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                    });
                } else {
                    logger.error('Ticket setup: database unavailable, panel sent but configuration was NOT saved', {
                        guildId: interaction.guildId,
                    });
                }

                let successMessage = `The ticket creation panel has been sent to ${panelChannel}.`;
                
                if (categoryChannel) {
                    successMessage += `New tickets will be created in the **${categoryChannel.name}** category.`;
                } else {
                    successMessage += 'New tickets will be created in a new "Tickets" category.';
                }
                
                if (closedCategoryChannel) {
                    successMessage += `Closed tickets will be moved to **${closedCategoryChannel.name}**.`;
                }
                
                if (staffRole) {
                    successMessage += `**${staffRole.name}** role will have access to tickets.`;
                }
                
                successMessage += `\n\n**Max Tickets Per User:** ${maxTicketsPerUser}\n**DM on Close:** ${dmOnClose ? 'Enabled' : 'Disabled'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Ticket Panel Set Up",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Ticket panel setup completed', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnClose: dmOnClose,
                    commandName: 'ticket_setup'
                });

                const logEmbed = createEmbed({
                    title: "Ticket System Setup (Configuration Log)",
                    description: `The ticket panel was set up in ${panelChannel} by ${interaction.user}.`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "Panel Channel",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "Ticket Category",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "None specified.",
                            inline: true,
                        },
                        {
                            name: "Closed Category",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "None specified.",
                            inline: true,
                        },
                        {
                            name: "Staff Role",
                            value: staffRole
                                ? staffRole.toString()
                                : "None specified.",
                            inline: true,
                        },
                        {
                            name: "Max Tickets Per User",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "DM on Close",
                            value: dmOnClose ? 'Enabled' : 'Disabled',
                            inline: true,
                        },
                        {
                            name: "Moderator",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (error) {
                logger.error('Ticket setup error', {
                    error: error.message,
                    stack: error.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Could not send the ticket panel or save configuration. Check the bot\'s permissions (especially the ability to send messages in the target channel) and database connection.' }).catch(err => {
                        logger.error('Failed to send error reply', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionError(interaction, error, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};

function aiFeedbackRow(kind) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ai-feedback:up:${kind}`)
            .setLabel('Helpful')
            .setStyle(ButtonStyle.Success)
            .setEmoji('👍'),
        new ButtonBuilder()
            .setCustomId(`ai-feedback:down:${kind}`)
            .setLabel('Not helpful')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👎'),
    );
}

async function requireTicketChannel(interaction, client) {
    const ticketData = await getTicketData(interaction.guildId, interaction.channelId).catch(() => null);
    if (!ticketData) {
        await replyUserError(interaction, {
            type: ErrorTypes.USER_INPUT,
            message: 'Run this inside a ticket channel.',
        });
        return null;
    }
    return ticketData;
}

async function executeAiSubcommand(interaction, client, subcommand) {
    if (!isAiAvailable()) {
        return replyUserError(interaction, {
            type: ErrorTypes.CONFIGURATION,
            message: 'The AI assistant is not configured (missing GROQ_API_KEY).',
        });
    }

    if (subcommand === 'ai-stats') {
        const stats = await getAiStats(client, interaction.guildId);
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                infoEmbed(
                    'AI Assistant Stats',
                    stats.total === 0
                        ? 'No staff feedback recorded yet. Rate AI outputs with 👍/👎 to build accuracy stats.'
                        : `**Feedback:** ${stats.total} (${stats.up} 👍 / ${stats.down} 👎)\n**Accuracy:** ${stats.accuracy}%`,
                ),
            ],
        });
    }

    if (subcommand === 'ai-config') {
        const patch = {};
        const assistant = interaction.options.getBoolean('assistant');
        const moderation = interaction.options.getBoolean('moderation');
        const sensitivity = interaction.options.getString('sensitivity');
        if (assistant !== null) patch.ticketAssistant = assistant;
        if (moderation !== null) patch.ticketModeration = moderation;
        if (sensitivity !== null) patch.sensitivity = sensitivity;
        const settings = await setAiSettings(client, interaction.guildId, patch);
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    'AI Configuration',
                    `**Assistant:** ${settings.ticketAssistant ? 'On' : 'Off'}\n**Ticket moderation:** ${settings.ticketModeration ? 'On' : 'Off'}\n**Sensitivity:** ${settings.sensitivity}`,
                ),
            ],
        });
    }

    const settings = await getAiSettings(client, interaction.guildId);
    if (!settings.ticketAssistant) {
        return replyUserError(interaction, {
            type: ErrorTypes.PERMISSION,
            message: 'The AI assistant is disabled on this server.',
        });
    }

    const ticketData = await requireTicketChannel(interaction, client);
    if (!ticketData) {
        return;
    }

    if (subcommand === 'summarize') {
        const result = await summarizeTicket(interaction.channel);
        if (result.error) {
            return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: result.error });
        }
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('Ticket Summary', result.content)],
            components: [aiFeedbackRow('summarize')],
        });
    }

    const hint = interaction.options.getString('hint') || '';
    const result = await suggestTicketReply(interaction.channel, hint);
    if (result.error) {
        return replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: result.error });
    }
    return InteractionHelper.safeEditReply(interaction, {
        embeds: [warningEmbed('Suggested Reply (review before sending)', result.content)],
        components: [aiFeedbackRow('suggest')],
    });
}

async function executeTicketOpSubcommand(interaction, client, subcommand) {
    const permissionContext = await getTicketPermissionContext({ client, interaction });
    if (!permissionContext.ticketData) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'This command can only be used in a valid ticket channel.' });
    }

    if (subcommand === 'close') {
        // Ticket creator may close their own ticket; staff (ManageChannels or
        // ticket staff role) may close any ticket.
        if (!permissionContext.canCloseTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission, the configured `Ticket Staff Role`, or be the ticket creator to close this ticket.' });
        }

        const reason =
            interaction.options?.getString("reason") ||
            "Closed via command without a specific reason.";

        await closeTicket(interaction.channel, interaction.user, reason);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Ticket Closed!",
                    "This ticket has been closed successfully.",
                ),
            ],
        });

        logger.info('Ticket closed successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            reason: reason,
            commandName: 'ticket close'
        });
        return;
    }

    if (subcommand === 'claim') {
        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission or the configured `Ticket Staff Role` to claim tickets.' });
        }

        await claimTicket(interaction.channel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Ticket Claimed!",
                    "You have successfully claimed this ticket.",
                ),
            ],
        });

        logger.info('Ticket claimed successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            commandName: 'ticket claim'
        });
        return;
    }

    // subcommand === 'priority'
    if (!permissionContext.canManageTicket) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the `Manage Channels` permission or the configured `Ticket Staff Role` to change ticket priority.' });
    }

    const priorityLevel = interaction.options.getString("level");
    await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [
            successEmbed(
                "Priority Updated",
                `Ticket priority set to **${priorityLevel.toUpperCase()}**.`,
            ),
        ],
    });

    logger.info('Ticket priority updated successfully', {
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        channelId: interaction.channel.id,
        channelName: interaction.channel.name,
        guildId: interaction.guildId,
        priority: priorityLevel,
        commandName: 'ticket priority'
    });
}