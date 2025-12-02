// Simple script to test environment variables and API connectivity
import fetch from 'node-fetch';

const requiredEnvVars = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'ITT_API_BASE'
];

console.log('🔍 Testing environment setup...\n');

// Check environment variables
let allEnvVarsPresent = true;
for (const envVar of requiredEnvVars) {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar}: Set`);
  } else {
    console.log(`❌ ${envVar}: Missing`);
    allEnvVarsPresent = false;
  }
}

console.log();

// Test API connectivity
if (allEnvVarsPresent) {
  console.log('🌐 Testing API connectivity...');

  try {
    const response = await fetch(`${process.env.ITT_API_BASE}/api/health`);
    if (response.ok) {
      console.log('✅ API health check: OK');
    } else {
      console.log(`❌ API health check: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ API connection failed: ${error.message}`);
    console.log('   Make sure ITT_API_BASE is correct and your Vercel app is deployed');
  }
} else {
  console.log('❌ Cannot test API - missing environment variables');
}

console.log('\n📝 Next steps:');
console.log('1. Set up your .env file with the required variables');
console.log('2. Run: npm install');
console.log('3. Run: npm start');
console.log('4. Invite bot to your Discord server');
console.log('5. Test commands in Discord');
