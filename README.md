# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and fill in your Firebase credentials (see below).
3. Run the app:
   `npm run dev`

## Environment variables

The application uses the following variables in the `.env` file:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FIREBASE_FUNCTION_URL` – URL of the Cloud Function used to send emails
- `VITE_RECAPTCHA_SITE_KEY` – site key for Google reCAPTCHA

Deploy a Firebase Cloud Function that receives the form data and sends emails (via Nodemailer, SendGrid, etc.).
