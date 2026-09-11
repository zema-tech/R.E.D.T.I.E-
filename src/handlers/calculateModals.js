import { successEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { evaluateMathExpression } from '../utils/safeMathParser.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
function evaluate(expression) {
    return evaluateMathExpression(expression);
}

async function calculateModalHandler(interaction, client, args) {
    try {
        const operation = args[0];
        // ModalSubmitFields has no .first() — locate the operand input by
        // its customId prefix (built as `operand:<userId>_<operation>`).
        const operandField = [...interaction.fields.fields.values()].find(
            (field) => typeof field?.customId === 'string' && field.customId.startsWith('operand:'),
        );
        const contextKey = operandField?.customId?.split(':')[1];
        
        if (!contextKey) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to retrieve calculation context.' });
        }

        const { calculationContexts } = await import('../commands/Tools/calculate.js');
        const context = calculationContexts.get(contextKey);

        if (!context) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This calculation has expired. Please start a new calculation.' });
        }

        // Only the user who opened the calculator may submit the modal.
        if (context.userId && context.userId !== interaction.user.id) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'This calculator belongs to another user.' });
        }

        await interaction.deferReply({ ephemeral: false });

        const operand = operandField?.value;
        
        if (!operand || isNaN(operand)) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please provide a valid number.' });
        }

        const { expression, formattedResult, operator } = context;
        const newExpression = `(${expression}) ${operator} (${operand})`;

        let newResult;
        try {
            newResult = evaluate(newExpression);
            
            let formattedNewResult;
            if (typeof newResult === "number") {
                formattedNewResult = newResult.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(newResult) > 0 &&
                    (Math.abs(newResult) >= 1e10 || Math.abs(newResult) < 1e-3)
                ) {
                    formattedNewResult = newResult.toExponential(6);
                }
            } else {
                formattedNewResult = String(newResult);
            }

            const updatedEmbed = successEmbed(
                "🧮 Calculation Result",
                `**Expression:** \`${newExpression.replace(/`/g, "\`")}\`\n` +
                    `**Result:** \`${formattedNewResult}\`\n\n` +
                    `*Use the buttons in the channel message to perform more operations.*`,
            );

            try {
                if (context.messageId && context.channelId) {
                    const channel = await client.channels.fetch(context.channelId);
                    const message = await channel.messages.fetch(context.messageId);
                    await message.edit({
                        embeds: [updatedEmbed],
                    });
                }
            } catch (editError) {
                logger.warn('Could not edit original message:', editError.message);
            }

            calculationContexts.delete(contextKey);

            await interaction.editReply({
                embeds: [successEmbed('✅ Calculated', `\`${newExpression}\` = \`${formattedNewResult}\``)],
            });

        } catch (calcError) {
            logger.error('Calculate evaluation error:', calcError);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Failed to evaluate the expression.' });
        }
    } catch (error) {
        logger.error('Calculate modal handler error:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred processing your calculation.' });
            } else {
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'An error occurred processing your calculation.' });
            }
        } catch (err) {
            logger.error('Failed to send error message:', err);
        }
    }
}

export default {
    execute: calculateModalHandler
};