/**
 * Test script to verify wc3stats API endpoint
 * Run with: node test-wc3stats-api.js
 */

import fetch from 'node-fetch';

// Possible API endpoints to test
const API_ENDPOINTS = [
  'https://wc3stats.com/api/gamelist',
  'https://wc3stats.com/gamelist',
  'https://api.wc3stats.com/gamelist',
  'https://wc3stats.com/api/games',
];

async function testEndpoint(url) {
  console.log(`\n🔍 Testing: ${url}`);
  console.log('─'.repeat(60));
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ITT-Discord-Bot/1.0',
      },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);

    if (!response.ok) {
      const text = await response.text();
      console.log(`Error Response: ${text.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    
    // Display response structure
    console.log('\n📊 Response Structure:');
    console.log(JSON.stringify(data, null, 2).substring(0, 1000));
    
    // Extract games array
    let games = [];
    if (Array.isArray(data)) {
      games = data;
      console.log(`\n✅ Response is an array with ${games.length} items`);
    } else if (data.body && Array.isArray(data.body)) {
      games = data.body;
      console.log(`\n✅ Response contains ${games.length} games in 'body' field`);
    } else if (data.games && Array.isArray(data.games)) {
      games = data.games;
      console.log(`\n✅ Response contains ${games.length} games in 'games' field`);
    } else if (data.data && Array.isArray(data.data)) {
      games = data.data;
      console.log(`\n✅ Response contains ${games.length} games in 'data' field`);
    } else {
      console.log('\n⚠️  Unexpected response structure');
      console.log('Keys:', Object.keys(data));
      return data;
    }

    if (games.length > 0) {
      console.log('\n📋 First game structure:');
      const firstGame = games[0];
      console.log(JSON.stringify(firstGame, null, 2));
      
      // Show all available fields
      console.log('\n📝 Available fields in game object:');
      Object.keys(firstGame).forEach(key => {
        console.log(`   - ${key}: ${typeof firstGame[key]} (example: ${JSON.stringify(firstGame[key]).substring(0, 50)})`);
      });
      
      // Check for ITT games
      const ittGames = games.filter(game => {
        const map = (game.map || game.name || '').toLowerCase();
        return map.startsWith('island.troll.tribes');
      });
      
      console.log(`\n🎮 Found ${ittGames.length} ITT games out of ${games.length} total games`);
      if (ittGames.length > 0) {
        console.log('\n📝 ITT Game Example:');
        console.log(JSON.stringify(ittGames[0], null, 2));
        
        console.log('\n📊 All ITT Games Summary:');
        ittGames.forEach((game, idx) => {
          console.log(`   ${idx + 1}. ${game.map} | Host: ${game.host} | Server: ${game.server} | Slots: ${game.slotsTaken}/${game.slotsTotal} | ID: ${game.id}`);
        });
      } else {
        console.log('\n💡 No ITT games currently active, but the filter logic works!');
        console.log('   Sample map names found:');
        games.slice(0, 5).forEach(game => {
          console.log(`   - ${game.map || game.name || 'N/A'}`);
        });
      }
    }

    return data;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    if (error.cause) {
      console.error(`Cause: ${error.cause.message || error.cause}`);
    }
    return null;
  }
}

async function main() {
  console.log('🚀 Testing wc3stats API Endpoints');
  console.log('='.repeat(60));

  let workingEndpoint = null;
  
  for (const endpoint of API_ENDPOINTS) {
    const result = await testEndpoint(endpoint);
    if (result !== null) {
      workingEndpoint = endpoint;
      console.log(`\n✅ Working endpoint found: ${endpoint}`);
      break;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (workingEndpoint) {
    console.log('\n' + '='.repeat(60));
    console.log('✅ API Verification Complete!');
    console.log(`📌 Use this endpoint: ${workingEndpoint}`);
    console.log('\n💡 Next steps:');
    console.log('   1. Note the response structure');
    console.log('   2. Identify the field that contains map names');
    console.log('   3. Check for unique identifier field (for deduplication)');
    console.log('   4. Update the implementation with correct field names');
  } else {
    console.log('\n' + '='.repeat(60));
    console.log('❌ No working endpoint found');
    console.log('\n💡 Try these alternatives:');
    console.log('   1. Check wc3stats.com/docs/api for correct endpoint');
    console.log('   2. Check if authentication is required');
    console.log('   3. Verify the API is still active');
  }
}

main().catch(console.error);

