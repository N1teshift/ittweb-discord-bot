// Suppress punycode deprecation warning (from dependencies)
// This warning comes from transitive dependencies and cannot be fixed directly
// We suppress it until the dependency maintainers update their code
const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, type, code, ctor) {
  const message = typeof warning === 'string' ? warning : warning?.message || '';
  
  // Suppress punycode deprecation (from dependencies - not fixable by us)
  if (message.includes('punycode')) {
    return;
  }
  
  // Emit all other warnings normally
  return originalEmitWarning.call(process, warning, type, code, ctor);
};

// Also listen to warning events as a backup
process.on('warning', (warning) => {
  // Suppress punycode deprecation (from dependencies)
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    return;
  }
  // Let other warnings through
});

import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Events, MessageFlags } from 'discord.js';
import { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } from './config.js';
import { handleSlashCommand } from './handlers/commands.js';
import { handleButton } from './handlers/buttons.js';
import { handleSelectMenu } from './handlers/selectMenus.js';
import { setClient } from './handlers/reminders.js';
import { initializeLobbyMonitor } from './handlers/lobbyMonitor.js';

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Slash commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('games')
    .setDescription('Browse and manage upcoming scheduled games'),
];

// Register commands with Discord
async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    if (DISCORD_GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: commands }
      );
      console.log('Commands registered for guild:', DISCORD_GUILD_ID);
    } else {
      await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
      console.log('Commands registered globally');
    }
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Event handlers
const onReady = () => {
  console.log(`Logged in as ${client.user.tag}!`);
  setClient(client);
  initializeLobbyMonitor(client);
  registerCommands();
};

// Use Events.ClientReady (the proper way in Discord.js v14+)
// This fixes the deprecation warning instead of just hiding it
client.on(Events.ClientReady, onReady);

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      console.log('Unhandled modal submission:', interaction.customId);
    }
  } catch (error) {
    console.error('Interaction error:', error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'An error occurred while processing your request.',
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (innerError) {
      console.error('Failed to send error response:', innerError);
    }
  }
});

// Login to Discord
client.login(DISCORD_TOKEN);
