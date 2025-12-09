import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TEAM_SIZE_OPTIONS, GAME_TYPE_OPTIONS, GAME_VERSION_OPTIONS } from '../config.js';
import { getDateOptions, getHourOptions, getMinuteOptions } from '../utils/time.js';
import { createScheduledGame, getGameById } from '../api.js';
import { db, isInitialized } from '../firebase.js';
import { logger } from '../utils/logger.js';
import { formatGameTime } from '../utils/format.js';
import { scheduleReminderForGame } from './reminders.js';

const COLLECTION_NAME = 'discord_bot_states';

// Helper to get state from Firestore
export async function getScheduleState(userId) {
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
      // Ensure defaults are set
      if (!state.teamSize) state.teamSize = '1v1';
      if (!state.gameType) state.gameType = 'elo';
      if (!state.gameVersion) state.gameVersion = 'v3.28';
      if (!state.minute) state.minute = '00';
      const saved = await saveScheduleState(user.id, state);
      if (!saved) {
        logger.warn(`State not persisted for user ${user.id}, but continuing with selection`);
      }
      // Re-read state to ensure we have the complete, latest state
      state = await getScheduleState(user.id);
      await updateScheduleStep2(interaction, state);
      return;
    }

    if (customId === 'schedule_hour') {
      state.hour = selectedValue;
      // Ensure defaults are set
      if (!state.teamSize) state.teamSize = '1v1';
      if (!state.gameType) state.gameType = 'elo';
      if (!state.gameVersion) state.gameVersion = 'v3.28';
      if (!state.date) {
        const today = new Date();
        state.date = today.toISOString().split('T')[0];
      }
      if (!state.minute) state.minute = '00';
      const saved = await saveScheduleState(user.id, state);
      if (!saved) {
        logger.warn(`State not persisted for user ${user.id}, but continuing with selection`);
      }
      // Re-read state to ensure we have the complete, latest state
      state = await getScheduleState(user.id);
      await updateScheduleStep2(interaction, state);
      return;
    }

    if (customId === 'schedule_minute') {
      state.minute = selectedValue;
      // Ensure defaults are set
      if (!state.teamSize) state.teamSize = '1v1';
      if (!state.gameType) state.gameType = 'elo';
      if (!state.gameVersion) state.gameVersion = 'v3.28';
      if (!state.date) {
        const today = new Date();
        state.date = today.toISOString().split('T')[0];
      }
      const saved = await saveScheduleState(user.id, state);
      if (!saved) {
        logger.warn(`State not persisted for user ${user.id}, but continuing with selection`);
      }
      // Re-read state to ensure we have the complete, latest state
      state = await getScheduleState(user.id);
      await updateScheduleStep2(interaction, state);
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
  // Use defaults if not set
  const teamSize = state.teamSize || '1v1';
  const gameType = state.gameType || 'elo';
  const gameVersion = state.gameVersion || 'v3.28';

  const teamSizeSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_team_size')
    .setPlaceholder(`Team Size: ${teamSize}`)
    .addOptions(
      TEAM_SIZE_OPTIONS.map((opt) => ({
        ...opt,
        default: opt.value === teamSize,
      }))
    );

  const gameTypeSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_game_type')
    .setPlaceholder(`Game Type: ${gameType}`)
    .addOptions(
      GAME_TYPE_OPTIONS.map((opt) => ({
        ...opt,
        default: opt.value === gameType,
      }))
    );

  const gameVersionSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_game_version')
    .setPlaceholder(`Version: ${gameVersion}`)
    .addOptions(
      GAME_VERSION_OPTIONS.map((opt) => ({
        ...opt,
        default: opt.value === gameVersion,
      }))
    );

  const row1 = new ActionRowBuilder().addComponents(teamSizeSelect);
  const row2 = new ActionRowBuilder().addComponents(gameTypeSelect);
  const row3 = new ActionRowBuilder().addComponents(gameVersionSelect);

  const components = [row1, row2, row3];

  // Always show continue button since defaults are set
  const continueButton = new ButtonBuilder()
    .setCustomId('schedule_continue')
    .setLabel('Continue to Date/Time →')
    .setStyle(ButtonStyle.Primary);

  components.push(new ActionRowBuilder().addComponents(continueButton));

  const selectedInfo = [];
  selectedInfo.push(`Team: ${teamSize}`);
  selectedInfo.push(`Type: ${gameType}`);
  selectedInfo.push(`Version: ${gameVersion}`);

  const statusText = selectedInfo.length > 0 ? `\n\n✅ Selected: ${selectedInfo.join(' • ')}` : '';

  await interaction.update({
    content: `📅 **Schedule a New Game - Step 1/2**\nSelect your game settings below:${statusText}`,
    components,
  });
}

async function updateScheduleStep2(interaction, state) {
  // Use defaults if not set
  const today = new Date();
  const todayDate = today.toISOString().split('T')[0];
  const date = state.date || todayDate;
  const minute = state.minute || '00';

  const dateSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_date')
    .setPlaceholder(`Date: ${date}`)
    .addOptions(
      getDateOptions().map((opt) => ({
        ...opt,
        default: opt.value === date,
      }))
    );

  const hourSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_hour')
    .setPlaceholder(state.hour ? `Hour: ${state.hour}` : 'Select hour (UTC)')
    .addOptions(
      getHourOptions().map((opt) => ({
        ...opt,
        default: opt.value === state.hour,
      }))
    );

  const minuteSelect = new StringSelectMenuBuilder()
    .setCustomId('schedule_minute')
    .setPlaceholder(`Minute: ${minute}`)
    .addOptions(
      getMinuteOptions().map((opt) => ({
        ...opt,
        default: opt.value === minute,
      }))
    );

  const row1 = new ActionRowBuilder().addComponents(dateSelect);
  const row2 = new ActionRowBuilder().addComponents(hourSelect);
  const row3 = new ActionRowBuilder().addComponents(minuteSelect);

  const components = [row1, row2, row3];

  // Show submit button if all fields are selected
  if (state.date && state.hour && state.minute) {
    const submitButton = new ButtonBuilder()
      .setCustomId('schedule_submit')
      .setLabel('✅ Schedule Game')
      .setStyle(ButtonStyle.Success);

    components.push(new ActionRowBuilder().addComponents(submitButton));
  }

  const selectedInfo = [];
  selectedInfo.push(`Date: ${date}`);
  if (state.hour !== undefined) {
    const period = parseInt(state.hour, 10) >= 12 ? 'PM' : 'AM';
    const displayHour = parseInt(state.hour, 10) === 0 ? 12 : parseInt(state.hour, 10) > 12 ? parseInt(state.hour, 10) - 12 : parseInt(state.hour, 10);
    selectedInfo.push(`Time: ${displayHour}:${minute} ${period} UTC`);
  } else {
    selectedInfo.push(`Minute: ${minute}`);
  }

  const statusText = selectedInfo.length > 0 ? `\n\n✅ Selected: ${selectedInfo.join(' • ')}` : '';

  // Use defaults if not set
  const teamSize = state.teamSize || '1v1';
  const gameType = state.gameType || 'elo';
  const gameVersion = state.gameVersion || 'v3.28';

  await interaction.update({
    content: `📅 **Schedule a New Game - Step 2/2**\n**Settings:** ${teamSize} ${gameType} (${gameVersion})\n\nSelect date and time:${statusText}`,
    components,
  });
}

export async function finalizeScheduleGame(interaction, state, user) {
  try {
    // Use defaults if not set
    const today = new Date();
    const todayDate = today.toISOString().split('T')[0];
    const date = state.date || todayDate;
    const minute = state.minute || '00';
    
    if (!state.hour) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '❌ Please select an hour.',
          components: [],
        });
      } else {
        await interaction.update({
          content: '❌ Please select an hour.',
          components: [],
        });
      }
      return;
    }
    
    const timeString = `${state.hour}:${minute}`;
    const scheduledDateTime = `${date}T${timeString}:00.000Z`;

    const scheduleDate = new Date(scheduledDateTime);
    if (scheduleDate <= new Date()) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: '❌ The selected time has already passed. Please select a future time.',
          components: [],
        });
      } else {
        await interaction.update({
          content: '❌ The selected time has already passed. Please select a future time.',
          components: [],
        });
      }
      return;
    }

    // Use defaults if not set
    const teamSize = state.teamSize || '1v1';
    const gameType = state.gameType || 'elo';
    const gameVersion = state.gameVersion || 'v3.28';

    const gameId = await createScheduledGame(
      user.id,
      user.displayName || user.username,
      scheduledDateTime,
      teamSize,
      gameType,
      gameVersion,
      1800,
      []
    );

    // Schedule reminder for the game creator (who is automatically added as participant)
    try {
      const createdGame = await getGameById(gameId);
      if (createdGame) {
        await scheduleReminderForGame(user.id, createdGame);
      }
    } catch (reminderError) {
      // Log but don't fail the game creation if reminder scheduling fails
      logger.error('Failed to schedule reminder for game creator', reminderError);
    }

    await clearScheduleState(user.id);

    const gameTime = formatGameTime(scheduleDate);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: `✅ **Game Scheduled Successfully!**\n\n🎮 **Game #${gameId}**\n📋 ${teamSize} ${gameType} (${gameVersion})\n⏰ ${gameTime} UTC`,
        components: [],
      });
    } else {
      await interaction.update({
        content: `✅ **Game Scheduled Successfully!**\n\n🎮 **Game #${gameId}**\n📋 ${teamSize} ${gameType} (${gameVersion})\n⏰ ${gameTime} UTC`,
        components: [],
      });
    }

    logger.info(`Game scheduled by ${user.username} for ${gameTime} UTC`, { 
      gameId, 
      userId: user.id,
      scheduledDateTime: scheduledDateTime,
      gameTime: gameTime
    });

  } catch (error) {
    logger.error('Failed to schedule game', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: `❌ Failed to schedule game: ${error.message}`,
        components: [],
      });
    } else {
      await interaction.update({
        content: `❌ Failed to schedule game: ${error.message}`,
        components: [],
      });
    }
  }
}

