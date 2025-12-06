import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TEAM_SIZE_OPTIONS, GAME_TYPE_OPTIONS, GAME_VERSION_OPTIONS } from '../config.js';
import { getDateOptions, getTimeOptions } from '../utils/time.js';
import { createScheduledGame } from '../api.js';
import { db, isInitialized } from '../firebase.js';
import { logger } from '../utils/logger.js';
import { formatGameTime } from '../utils/format.js';

const COLLECTION_NAME = 'discord_bot_states';

// Helper to get state from Firestore
async function getScheduleState(userId) {
  if (!db || !isInitialized) {
    logger.warn(`Firebase not initialized, returning empty state for user ${userId}`);
    return {};
  }
  try {
    const doc = await db.collection(COLLECTION_NAME).doc(userId).get();
    return doc.exists ? doc.data() : {};
  } catch (error) {
    logger.error(`Failed to get schedule state for user ${userId}`, error, {
      errorCode: error.code,
      errorMessage: error.message,
      userId
    });
    return {};
  }
}

// Helper to save state to Firestore
// Returns true if successful, false otherwise
async function saveScheduleState(userId, state) {
  if (!db || !isInitialized) {
    logger.warn(`Firebase not initialized, cannot save state for user ${userId}`);
    return false;
  }
  try {
    await db.collection(COLLECTION_NAME).doc(userId).set(state, { merge: true });
    return true;
  } catch (error) {
    logger.error(`Failed to save schedule state for user ${userId}`, error, {
      errorCode: error.code,
      errorMessage: error.message,
      userId,
      stateKeys: Object.keys(state)
    });
    return false;
  }
}

// Helper to clear state from Firestore
export async function clearScheduleState(userId) {
  if (!db || !isInitialized) {
    logger.warn(`Firebase not initialized, cannot clear state for user ${userId}`);
    return;
  }
  try {
    await db.collection(COLLECTION_NAME).doc(userId).delete();
  } catch (error) {
    logger.error(`Failed to clear schedule state for user ${userId}`, error, {
      errorCode: error.code,
      errorMessage: error.message,
      userId
    });
  }
}

export async function handleScheduleSelectMenu(interaction) {
  const { customId, values, user } = interaction;
  const selectedValue = values[0];

  try {
    let state = await getScheduleState(user.id);

    if (customId === 'schedule_team_size') {
      state.teamSize = selectedValue;
      const saved = await saveScheduleState(user.id, state);
      if (!saved) {
        // Still update UI with current selection, but warn user
        logger.warn(`State not persisted for user ${user.id}, but continuing with selection`);
      }
      // Re-read state to ensure we have the complete, latest state
      state = await getScheduleState(user.id);
      await updateScheduleStep1(interaction, state);
      return;
    }

    if (customId === 'schedule_game_type') {
      state.gameType = selectedValue;
      const saved = await saveScheduleState(user.id, state);
      if (!saved) {
        logger.warn(`State not persisted for user ${user.id}, but continuing with selection`);
      }
      // Re-read state to ensure we have the complete, latest state
      state = await getScheduleState(user.id);
      await updateScheduleStep1(interaction, state);
      return;
    }

    if (customId === 'schedule_game_version') {
      state.gameVersion = selectedValue;
      const saved = await saveScheduleState(user.id, state);
      if (!saved) {
        logger.warn(`State not persisted for user ${user.id}, but continuing with selection`);
      }
      // Re-read state to ensure we have the complete, latest state
      state = await getScheduleState(user.id);
      await updateScheduleStep1(interaction, state);
      return;
    }

    if (customId === 'schedule_date') {
      state.date = selectedValue;
      const saved = await saveScheduleState(user.id, state);
      if (!saved) {
        logger.warn(`State not persisted for user ${user.id}, but continuing with selection`);
      }
      // Re-read state to ensure we have the complete, latest state
      state = await getScheduleState(user.id);
      await updateScheduleStep2(interaction, state);
      return;
    }

    if (customId === 'schedule_time') {
      state.time = selectedValue;
      const saved = await saveScheduleState(user.id, state);
      if (!saved) {
        logger.warn(`State not persisted for user ${user.id}, but continuing with selection`);
      }
      // Re-read state to ensure we have the complete, latest state
      state = await getScheduleState(user.id);

      if (state.teamSize && state.gameType && state.gameVersion && state.date && state.time) {
        await finalizeScheduleGame(interaction, state, user);
      } else {
        await updateScheduleStep2(interaction, state);
      }
      return;
    }
  } catch (error) {
    logger.error('Error handling schedule select menu', error);
    try {
      await interaction.update({
        content: '❌ An error occurred while saving your selection. Please try again.',
        components: [],
      });
    } catch (updateError) {
      logger.error('Failed to send error response', updateError);
    }
  }
}

async function updateScheduleStep1(interaction, state) {
  const teamSizeSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_team_size')
    .setPlaceholder(state.teamSize ? `Team Size: ${state.teamSize}` : 'Select team size')
    .addOptions(
      TEAM_SIZE_OPTIONS.map((opt) => ({
        ...opt,
        default: opt.value === state.teamSize,
      }))
    );

  const gameTypeSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_game_type')
    .setPlaceholder(state.gameType ? `Game Type: ${state.gameType}` : 'Select game type')
    .addOptions(
      GAME_TYPE_OPTIONS.map((opt) => ({
        ...opt,
        default: opt.value === state.gameType,
      }))
    );

  const gameVersionSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_game_version')
    .setPlaceholder(state.gameVersion ? `Version: ${state.gameVersion}` : 'Select game version')
    .addOptions(
      GAME_VERSION_OPTIONS.map((opt) => ({
        ...opt,
        default: opt.value === state.gameVersion,
      }))
    );

  const row1 = new ActionRowBuilder().addComponents(teamSizeSelect);
  const row2 = new ActionRowBuilder().addComponents(gameTypeSelect);
  const row3 = new ActionRowBuilder().addComponents(gameVersionSelect);

  const components = [row1, row2, row3];

  if (state.teamSize && state.gameType && state.gameVersion) {
    const continueButton = new ButtonBuilder()
      .setCustomId('schedule_continue')
      .setLabel('Continue to Date/Time →')
      .setStyle(ButtonStyle.Primary);

    components.push(new ActionRowBuilder().addComponents(continueButton));
  }

  const selectedInfo = [];
  if (state.teamSize) selectedInfo.push(`Team: ${state.teamSize}`);
  if (state.gameType) selectedInfo.push(`Type: ${state.gameType}`);
  if (state.gameVersion) selectedInfo.push(`Version: ${state.gameVersion}`);

  const statusText = selectedInfo.length > 0 ? `\n\n✅ Selected: ${selectedInfo.join(' • ')}` : '';

  await interaction.update({
    content: `📅 **Schedule a New Game - Step 1/2**\nSelect your game settings below:${statusText}`,
    components,
  });
}

async function updateScheduleStep2(interaction, state) {
  const dateSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_date')
    .setPlaceholder(state.date ? `Date: ${state.date}` : 'Select date')
    .addOptions(
      getDateOptions().map((opt) => ({
        ...opt,
        default: opt.value === state.date,
      }))
    );

  const timeSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_time')
    .setPlaceholder(state.time ? `Time: ${state.time} UTC` : 'Select time (UTC)')
    .addOptions(
      getTimeOptions()
        .slice(0, 25)
        .map((opt) => ({
          ...opt,
          default: opt.value === state.time,
        }))
    );

  const row1 = new ActionRowBuilder().addComponents(dateSelect);
  const row2 = new ActionRowBuilder().addComponents(timeSelect);

  const selectedInfo = [];
  if (state.date) selectedInfo.push(`Date: ${state.date}`);
  if (state.time) selectedInfo.push(`Time: ${state.time} UTC`);

  const statusText = selectedInfo.length > 0 ? `\n\n✅ Selected: ${selectedInfo.join(' • ')}` : '';

  await interaction.update({
    content: `📅 **Schedule a New Game - Step 2/2**\n**Settings:** ${state.teamSize} ${state.gameType} (${state.gameVersion})\n\nSelect date and time:${statusText}`,
    components: [row1, row2],
  });
}

async function finalizeScheduleGame(interaction, state, user) {
  try {
    const scheduledDateTime = `${state.date}T${state.time}:00.000Z`;

    const scheduleDate = new Date(scheduledDateTime);
    if (scheduleDate <= new Date()) {
      await interaction.update({
        content: '❌ The selected time has already passed. Please select a future time.',
        components: [],
      });
      return;
    }

    const gameId = await createScheduledGame(
      user.id,
      user.displayName || user.username,
      scheduledDateTime,
      state.teamSize,
      state.gameType,
      state.gameVersion,
      1800,
      []
    );

    await clearScheduleState(user.id);

    const gameTime = formatGameTime(scheduleDate);

    await interaction.update({
      content: `✅ **Game Scheduled Successfully!**\n\n🎮 **Game #${gameId}**\n📋 ${state.teamSize} ${state.gameType} (${state.gameVersion})\n⏰ ${gameTime} UTC`,
      components: [],
    });

    logger.info(`Game scheduled by ${user.username}`, { gameId, userId: user.id });

  } catch (error) {
    logger.error('Failed to schedule game', error);
    await interaction.update({
      content: `❌ Failed to schedule game: ${error.message}`,
      components: [],
    });
  }
}

