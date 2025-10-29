# Firebase Setup Instructions

## Getting Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `respike-670a4`
3. Click on the gear icon ⚙️ (Project Settings)
4. Go to the "Service accounts" tab
5. Click "Generate new private key"
6. Save the downloaded JSON file as `firebase-service-account.json` in the root of `respike_backend` folder

## Important Security Notes

- The `firebase-service-account.json` file is already added to `.gitignore`
- **NEVER** commit this file to version control
- Keep this file secure as it provides full access to your Firebase project

## Alternative: Using Environment Variables

If you prefer not to use a service account file, you can set these environment variables in your `.env`:

```
FIREBASE_PROJECT_ID=respike-670a4
FIREBASE_PRIVATE_KEY=your-private-key-here
FIREBASE_CLIENT_EMAIL=your-service-account-email
```

The application will automatically use these if the service account file is not found.

