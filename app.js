const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4444;

// Enable CORS for frontend interactions
app.use(cors());
app.use(express.json());

// GOOGLE OAUTH CLIENT CONFIGURATION
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/oauth/callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Step 1 & 2: Redirect user to Google's OAuth 2.0 endpoint (or return auth URL for frontend)
app.get('/login', (req, res) => {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'openid email profile');
    authUrl.searchParams.append('access_type', 'offline'); // Requests a refresh_token
    authUrl.searchParams.append('prompt', 'consent');     // Forces consent prompt for demo

    // If frontend requests auth URL as JSON
    if (req.query.json === 'true') {
        return res.json({
            authUrl: authUrl.toString(),
            clientId: CLIENT_ID,
            redirectUri: REDIRECT_URI,
        });
    }

    res.redirect(authUrl.toString());
});

// Helper function to exchange code for tokens and fetch user profile
async function exchangeCodeForTokensAndUser(code) {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code: code.toString(),
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
        const error = new Error(tokens.error_description || tokens.error || 'Token exchange failed');
        error.status = tokenResponse.status;
        error.details = tokens;
        throw error;
    }

    // Step 6: Use access_token to request user profile from Google Resource Server
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userData = await userResponse.json();

    return {
        message: 'Successfully authenticated!',
        tokens: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            token_type: tokens.token_type,
            id_token: tokens.id_token,
        },
        user: userData,
    };
}

// Step 3 & 4: Receive authorization code & exchange it for tokens
app.get('/oauth/callback', async (req, res) => {
    const { code, state, error: oauthError, error_description } = req.query;

    if (oauthError) {
        return res.status(400).json({
            error: oauthError,
            description: error_description,
        });
    }

    if (!code) {
        return res.status(400).send('Error: Authorization code not provided.');
    }

    try {
        const result = await exchangeCodeForTokensAndUser(code);

        // If redirect_to_frontend is requested or standard browser flow
        if (req.query.return_to_frontend === 'true' || req.headers.accept?.includes('text/html')) {
            const payload = encodeURIComponent(JSON.stringify(result));
            return res.redirect(`${FRONTEND_URL}/#auth_success=${payload}`);
        }

        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { error: error.message });
    }
});

// API endpoint for frontend to exchange code directly
app.post('/api/oauth/exchange', async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'Authorization code is required' });
    }

    try {
        const result = await exchangeCodeForTokensAndUser(code);
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { error: error.message });
    }
});

// API endpoint to fetch user info using access token
app.get('/api/userinfo', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Bearer token missing in Authorization header' });
    }

    try {
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: authHeader },
        });

        const userData = await userResponse.json();
        if (!userResponse.ok) {
            return res.status(userResponse.status).json(userData);
        }

        res.json(userData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Diagnostic route for frontend testing & system health
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        config: {
            port: PORT,
            redirectUri: REDIRECT_URI,
            clientIdConfigured: CLIENT_ID !== 'YOUR_CLIENT_ID' && !!CLIENT_ID,
            clientSecretConfigured: CLIENT_SECRET !== 'YOUR_CLIENT_SECRET' && !!CLIENT_SECRET,
            clientIdPrefix: CLIENT_ID ? `${CLIENT_ID.substring(0, 12)}...` : 'not set',
            frontendUrl: FRONTEND_URL,
        },
        endpoints: [
            { path: '/', method: 'GET', description: 'Root health check' },
            { path: '/login', method: 'GET', description: 'Initiate Google OAuth flow' },
            { path: '/login?json=true', method: 'GET', description: 'Get auth URL as JSON' },
            { path: '/oauth/callback', method: 'GET', description: 'OAuth callback code exchange' },
            { path: '/api/oauth/exchange', method: 'POST', description: 'Exchange auth code for tokens' },
            { path: '/api/userinfo', method: 'GET', description: 'Verify token & fetch Google user profile' },
            { path: '/api/status', method: 'GET', description: 'Backend diagnostic status' },
        ],
    });
});

// Root endpoint for debugging
app.get('/', (req, res) => {
    res.send("the root of 4444 is running ok ");
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Visit http://localhost:${PORT}/login to start the flow`);
});