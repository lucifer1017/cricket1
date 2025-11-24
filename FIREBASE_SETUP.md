# Firebase Setup Guide

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard

## Step 2: Enable Authentication

1. In your Firebase project, go to **Authentication** in the left sidebar
2. Click **Get Started**
3. Enable **Email/Password** authentication:
   - Click on "Email/Password"
   - Toggle "Enable" to ON
   - Click "Save"
4. Enable **Google** authentication:
   - Click on "Google"
   - Toggle "Enable" to ON
   - Enter your project support email (if prompted)
   - Click "Save"

## Step 3: Get Your Firebase Config

1. In Firebase Console, click the gear icon ⚙️ next to "Project Overview"
2. Select **Project settings**
3. Scroll down to **Your apps** section
4. If you don't have a web app, click the `</>` icon to add one
5. Copy the config values from the Firebase SDK snippet

## Step 4: Create Environment File

Create a `.env.local` file in the root of your project with the following:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Replace the placeholder values with your actual Firebase config values.

## Step 5: Test the Authentication

1. Run `npm run dev`
2. Navigate to `http://localhost:3000/auth`
3. Try creating an account and signing in!

## Security Notes

- Never commit `.env.local` to version control (it's already in `.gitignore`)
- The `NEXT_PUBLIC_` prefix makes these variables available in the browser
- For production, set these variables in your hosting platform's environment settings


