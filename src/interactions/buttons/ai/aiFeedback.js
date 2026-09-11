// 👍/👎 feedback on AI outputs — the self-improvement loop.
// Custom IDs: ai-feedback:<up|down>:<summarize|suggest>

import { MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { recordAiFeedback } from '../../../services/ai/ticketAi.js';
import { logger } from '../../../utils/logger.js';

const aiFeedbackHandler = {
  name: 'ai-feedback',

  async execute(interaction, client, args) {
    try {
      const [rating, kind] = args || [];
      if (!['up', 'down'].includes(rating) || !['summarize', 'suggest'].includes(kind)) {
        return;
      }

      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      await recordAiFeedback(client, interaction.guildId, { kind, rating, excerpt: '' });

      await InteractionHelper.safeEditReply(interaction, {
        content: rating === 'up'
          ? 'Thanks — your feedback helps the assistant improve.'
          : 'Noted — staff will review this output to improve future answers.',
      });
    } catch (error) {
      logger.warn('AI feedback handler failed:', error?.message);
    }
  },
};

export default [aiFeedbackHandler];
