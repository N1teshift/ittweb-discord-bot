import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TEAM_SIZE_OPTIONS, GAME_TYPE_OPTIONS, GAME_VERSION_OPTIONS } from '../config.js';
import { getDateOptions, getTimeOptions } from '../utils/time.js';
import { createScheduledGame } from '../api.js';

// Temporary storage for schedule flow state
export const scheduleFlowState = new Map();

export async function handleScheduleSelectMenu(interaction) {
  const { customId, values, user } = interaction;
  const selectedValue = values[0];

  let state = scheduleFlowState.get(user.id) || {};

  if (customId === 'schedule_team_size') {
    state.teamSize = selectedValue;
    scheduleFlowState.set(user.id, state);
    await updateScheduleStep1(interaction, state);
    return;
  }

  if (customId === 'schedule_game_type') {
    state.gameType = selectedValue;
    scheduleFlowState.set(user.id, state);
    await updateScheduleStep1(interaction, state);
    return;
  }

  if (customId === 'schedule_game_version') {
    state.gameVersion = selectedValue;
    scheduleFlowState.set(user.id, state);
    await updateScheduleStep1(interaction, state);
    return;
  }

  if (customId === 'schedule_date') {
    state.date = selectedValue;
    scheduleFlowState.set(user.id, state);
    await updateScheduleStep2(interaction, state);
    return;
  }

  if (customId === 'schedule_time') {
    state.time = selectedValue;
    scheduleFlowState.set(user.id, state);

    if (state.teamSize && state.gameType && state.gameVersion && state.date && state.time) {
      await finalizeScheduleGame(interaction, state, user);
    } else {
      await updateScheduleStep2(interaction, state);
    }
    return;
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

    scheduleFlowState.delete(user.id);

    const gameTime = scheduleDate.toLocaleString('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    await interaction.update({
      content: `✅ **Game Scheduled Successfully!**\n\n🎮 **Game #${gameId}**\n📋 ${state.teamSize} ${state.gameType} (${state.gameVersion})\n⏰ ${gameTime} UTC`,
      components: [],
    });
  } catch (error) {
    console.error('Failed to schedule game:', error);
    await interaction.update({
      content: `❌ Failed to schedule game: ${error.message}`,
      components: [],
    });
  }
}

