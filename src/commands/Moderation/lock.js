import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes, TitanBotError } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription(
      "Lock or unlock the current channel.",
    )
    .addSubcommand((s) =>
        s
            .setName("lock")
            .setDescription("Locks the current channel (prevents @everyone from sending messages)."),
    )
    .addSubcommand((s) =>
        s
            .setName("unlock")
            .setDescription("Unlocks the current channel (allows @everyone to send messages again)."),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  category: "moderation",

  async execute(interaction, config, client) {
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case "lock":
        return handleLock(interaction, config, client);
      case "unlock":
        return handleUnlock(interaction, config, client);
      default:
        throw new TitanBotError(
          'Unknown subcommand',
          ErrorTypes.USER_INPUT,
          'Unknown lock subcommand. Use lock or unlock.',
        );
    }
  }
};

async function handleLock(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`Lock interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'lock'
      });
      return;
    }

    const channel = interaction.channel;
    const everyoneRole = interaction.guild.roles.everyone;

    try {
      const currentPermissions = channel.permissionsFor(everyoneRole);
      if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `${channel} is already locked.` });
      }

      await channel.permissionOverwrites.edit(
        everyoneRole,
        { SendMessages: false },
{ type: 0, reason: `Channel locked by ${interaction.user.tag}` },
      );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Channel Locked",
          target: channel.toString(),
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          metadata: {
            channelId: channel.id,
            category: channel.parent?.name || 'None',
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            `🔒 **Channel Locked**`,
            `${channel} is now locked down. No one can speak here now.`,
          ),
        ],
      });
    } catch (error) {
      logger.error('Lock command error:', error);
      await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'An unexpected error occurred while trying to lock the channel. Check my permissions (I need \'Manage Channels\').' });
    }
}

async function handleUnlock(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`Unlock interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'unlock'
        });
        return;
    }

    const channel = interaction.channel;
    const everyoneRole = interaction.guild.roles.everyone;

    try {
        const currentPermissions = channel.permissionsFor(everyoneRole);
        if (
            currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                true ||
            currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                null
        ) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `${channel} is not explicitly locked (everyone can already send messages).` });
        }

        await channel.permissionOverwrites.edit(
            everyoneRole,
            { SendMessages: true },
            {
                type: 0,
                reason: `Channel unlocked by ${interaction.user.tag}`,
},
        );

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: "Channel Unlocked",
                target: channel.toString(),
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                metadata: {
                    channelId: channel.id,
                    category: channel.parent?.name || 'None'
                }
            }
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `🔓 **Channel Unlocked**`,
                    `${channel} is now unlocked. You may speak now.`,
                ),
            ],
        });
    } catch (error) {
        logger.error('Unlock command error:', error);
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'An unexpected error occurred while trying to unlock the channel. Check my permissions (I need \'Manage Channels\').' });
    }
}
