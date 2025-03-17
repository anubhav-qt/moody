import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import session from 'express-session';
import spotifyRoutes from './routes/spotify';
import './services/firebaseService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000; // Changed port from 3000 to 5000

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

// API routes
app.use('/api/spotify', spotifyRoutes);

// In production, serve the React app
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
