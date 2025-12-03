import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } from './config.js';
import { handleSlashCommand } from './handlers/commands.js';
import { handleButton } from './handlers/buttons.js';
import { handleSelectMenu } from './handlers/selectMenus.js';
import { setClient } from './handlers/reminders.js';

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
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  setClient(client);
  registerCommands();
});

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
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true,
        });
      }
    } catch (innerError) {
      console.error('Failed to send error response:', innerError);
    }
  }
});

// Login to Discord
client.login(DISCORD_TOKEN);
