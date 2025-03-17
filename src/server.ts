import express from 'express';
import dotenv from 'dotenv';
import session from 'express-session';
import spotifyRoutes from './routes/spotify';
import './services/firebaseService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(session({
  secret: process.env.SESSION_SECRET || 'spotify-moody-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
  }
}));

declare module 'express-session' {
  interface SessionData {
    codeVerifier?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpires?: number;
    spotifyUserId?: string;
  }
}

app.use(express.json());

// Mount Spotify routes
app.use('/api/spotify', spotifyRoutes);
app.use('/', spotifyRoutes); // This allows /callback to work correctly

app.get('/', (_req, res) => {
  res.send('Moody API is running');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
