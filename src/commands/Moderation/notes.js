import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, getUserNotesKey } from '../../utils/database.js';
import { getModerationCases } from '../../utils/moderation.js';
import { sanitizeInput } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("notes")
        .setDescription("Manage user notes and view moderation cases")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a note to a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("The user to add a note for")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("The note to add")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Type of note")
                        .addChoices(
                            { name: "Warning", value: "warning" },
                            { name: "Positive", value: "positive" },
                            { name: "Neutral", value: "neutral" },
                            { name: "Alert", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("View notes for a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("The user to view notes for")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a specific note from a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("The user to remove a note from")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("The index of the note to remove")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Clear all notes for a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("The user to clear notes for")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("cases")
                .setDescription("View moderation cases and audit logs")
                .addStringOption(option =>
                    option.setName('filter')
                        .setDescription('Filter cases by type or user')
                        .addChoices(
                            { name: 'All Cases', value: 'all' },
                            { name: 'Bans', value: 'Member Banned' },
                            { name: 'Kicks', value: 'Member Kicked' },
                            { name: 'Timeouts', value: 'Member Timed Out' },
                            { name: 'Warnings', value: 'User Warned' }
                        )
                )
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Filter cases by specific user')
                )
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of cases to show (default: 10)')
                        .setMinValue(1)
                        .setMaxValue(50)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: "moderation",

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "cases") {
            return await handleCases(interaction, config, client);
        }

        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (subcommand !== "list" && subcommand !== "remove" && subcommand !== "clear" && subcommand !== "add") {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please select a valid subcommand.' });
        }

        let notes = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes, guildId);
                case "list":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes, guildId);
                default:
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please select a valid subcommand.' });
            }
        } catch (error) {
            logger.error(`Error in notes command (${subcommand}):`, error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while processing your request. Please try again later.' });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Notes must be 1000 characters or less.' });
    }

    if (note.length === 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Note cannot be empty.' });
    }

    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Note Added`,
                `Added a **${type}** note for **${targetUser.tag}**:\n\n` +
                `> ${note}\n\n` +
                `**Moderator:** ${interaction.user.tag}\n` +
                `**Total Notes:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 No Notes",
                    `There are no notes for **${targetUser.tag}**.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**Notes for ${targetUser.tag} (${targetUser.id}):**\n\n`;

    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **Note #${index + 1}** (${note.type}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Added by ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(truncated)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 User Notes (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
    const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Please provide a valid note index (1-${notes.length}).` });
    }

    // The view command displays notes sorted newest-first, so resolve the index
    // against the same ordering to delete the note the user actually sees.
    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const removedNote = sortedNotes[index];
    const originalIndex = notes.indexOf(removedNote);
    notes.splice(originalIndex, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Note Removed`,
                `Removed note #${index + 1} from **${targetUser.tag}**:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Remaining Notes:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;

    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "No Notes to Clear",
                    `There are no notes for **${targetUser.tag}** to clear.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ Notes Cleared",
                `Cleared **${noteCount}** notes from **${targetUser.tag}**.`
            )
        ]
    });
}

async function handleCases(interaction, _config, _client) {
    // The audit-log view keeps its original stricter gate: ViewAuditLog.
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the "View Audit Log" permission to view moderation cases.' });
    }

    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Cases interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'cases'
        });
        return;
    }

    try {
        const filterType = interaction.options.getString('filter') || 'all';
        const targetUser = interaction.options.getUser('user');
        const limit = interaction.options.getInteger('limit') || 10;

        const filters = {
            limit,
            action: filterType === 'all' ? undefined : filterType,
            userId: targetUser?.id
        };

        const cases = await getModerationCases(interaction.guild.id, filters);

        if (cases.length === 0) {
            throw new Error(targetUser
                ? `No moderation cases found for ${targetUser.tag}`
                : `No ${filterType === 'all' ? '' : filterType} cases found in this server.`
            );
        }

        const CASES_PER_PAGE = 5;
        const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
        let currentPage = 1;

        const createCasesEmbed = (page) => {
            const startIndex = (page - 1) * CASES_PER_PAGE;
            const endIndex = startIndex + CASES_PER_PAGE;
            const pageCases = cases.slice(startIndex, endIndex);

            const embed = createEmbed({
                title: 'Moderation Cases',
                description: `Showing moderation cases for **${interaction.guild.name}**\n\n**Page ${page} of ${totalPages}**`
            });

            pageCases.forEach(case_ => {
                const date = new Date(case_.createdAt).toLocaleDateString();
                const time = new Date(case_.createdAt).toLocaleTimeString();

                embed.addFields({
                    name: `Case #${case_.caseId} - ${case_.action}`,
                    value: `**Target:** ${case_.target}\n**Moderator:** ${case_.executor}\n**Date:** ${date} at ${time}\n**Reason:** ${case_.reason || 'No reason provided'}`,
                    inline: false
                });
            });

            embed.setFooter({
                text: `Total cases: ${cases.length} | Filter: ${filterType}${targetUser ?` | User: ${targetUser.tag}`: ''}`
            });

            return embed;
        };

        const createNavigationRow = (page) => {
            const row = new ActionRowBuilder();

            const prevButton = new ButtonBuilder()
                .setCustomId('prev_page')
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 1);

            const pageInfoButton = new ButtonBuilder()
                .setCustomId('page_info')
                .setLabel(`Page ${page}/${totalPages}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true);

            const nextButton = new ButtonBuilder()
                .setCustomId('next_page')
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages);

            row.addComponents(prevButton, pageInfoButton, nextButton);
            return row;
        };

        const message = await interaction.editReply({
            embeds: [createCasesEmbed(currentPage)],
            components: [createNavigationRow(currentPage)]
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
time: 120000
        });

        collector.on('collect', async (buttonInteraction) => {
            await buttonInteraction.deferUpdate();

            if (buttonInteraction.user.id !== interaction.user.id) {
                await buttonInteraction.followUp({
                    content: 'You cannot use these buttons. Run `/notes cases` to get your own case view.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const { customId } = buttonInteraction;

            if (customId === 'prev_page' && currentPage > 1) {
                currentPage--;
            } else if (customId === 'next_page' && currentPage < totalPages) {
                currentPage++;
            }

            await interaction.editReply({
                embeds: [createCasesEmbed(currentPage)],
                components: [createNavigationRow(currentPage)]
            });
        });

        collector.on('end', async () => {
            const disabledRow = createNavigationRow(currentPage);
            disabledRow.components.forEach(button => button.setDisabled(true));

            try {
                await message.edit({
                    components: [disabledRow]
                });
            } catch (error) {
            }
        });

    } catch (error) {
        logger.error('Error in cases command:', error);
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred while retrieving moderation cases. Please try again later.' });
    }
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };

    return types[type] || types.neutral;
}
