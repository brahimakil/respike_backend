# Backend Environment Configuration

## ✅ Your `.env` file has been created!

The `.env` file in the `respike_backend` folder contains:

```env
PORT=3000
NODE_ENV=development
DATABASE_TYPE=firebase
FIREBASE_PROJECT_ID=respike-670a4
FIREBASE_STORAGE_BUCKET=respike-670a4.firebasestorage.app
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=respike-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

## 🔥 Firebase Service Account

You already have the `firebase-service-account.json` file in the backend root directory. This is perfect!

The backend will automatically use this file for Firebase Admin SDK authentication.

## ✅ You're Ready!

Your backend is now fully configured. To start the server:

```bash
cd c:\laragon\www\respike\respike_backend
npm install
npm run start:dev
```

The server will run on `http://localhost:3000`

