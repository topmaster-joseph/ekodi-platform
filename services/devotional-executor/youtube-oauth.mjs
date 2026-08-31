import { google } from 'googleapis';

const clientId = process.env.YOUTUBE_CLIENT_ID || '';
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || '';
const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI || 'http://localhost:8789/oauth2callback';
const code = process.argv.find(arg => arg.startsWith('--code='))?.slice(7) || '';

if (!clientId || !clientSecret) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first.');
  process.exit(1);
}

const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const scopes = ['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube'];

if (!code) {
  const url = oauth.generateAuthUrl({ access_type:'offline', prompt:'consent', scope:scopes });
  console.log('Open this URL in the Google account that owns the target YouTube channel:');
  console.log(url);
  console.log('\nThen run again with --code=<authorization-code>.');
  process.exit(0);
}

const { tokens } = await oauth.getToken(code);
console.log(JSON.stringify({
  refresh_token:tokens.refresh_token || '',
  scope:tokens.scope || '',
  token_type:tokens.token_type || ''
}, null, 2));