const express=require('express');

const app = express();
const dotenv=require('dotenv');
dotenv.config();

const session = require('express-session');
// const MongoStore = require('connect-mongo');
const {MongoStore} = require('connect-mongo');
const User=require('./models/User')
const {user_entry_lookup_on_login}=require('./handlers/find_user_on_login_in_user_table')

const PORT = process.env.PORT;

// Configuration from Google Cloud Console
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = `http://localhost:${PORT}/oauth/callback`;

//////// app.use thingies-------------------------------------------------------------------

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI
        }),
        cookie: {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    })
);

//----------------------------------------------------------------------------------------------------------------------


///-------mongoose defn and connection logic
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));


//----------------------------------------------------------------------------------------------------------------------




// Step 1 & 2: Redirect user to Google's OAuth 2.0 endpoint
app.get('/login', (req, res) => {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'openid email profile');
  authUrl.searchParams.append('access_type', 'offline'); // Requests a refresh_token
  authUrl.searchParams.append('prompt', 'consent');     // Forces consent prompt for demo

  res.redirect(authUrl.toString());
});

// Step 3 & 4: Receive authorization code & exchange it for tokens
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Error: Authorization code not provided.');
  }
  try {
    // Exchange the code for Access Token and Refresh Token
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
      return res.status(tokenResponse.status).json(tokens);
    }



    // Step 6: Use access_token to request user profile from Google Resource Server
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userResponse.json();
    res.json({
      message: 'Successfully authenticated!',
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
      },
      user: userData,
    });



    //updated step 5
      user_entry_lookup_on_login(userData);


  } catch (error) {
    res.status(500).json({ error: error.message });
  }



});


app.get('/', (req,res)=>{
  console.log("on root")
  res.send("on root")
})




app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT}/login to start the flow`);
});