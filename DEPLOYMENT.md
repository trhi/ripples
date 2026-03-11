# Deploying RIPPLES to Vercel

This guide explains how to deploy the RIPPLES Worldtext Generator to Vercel with secure API key storage.

## Prerequisites

- A Vercel account (sign up at [vercel.com](https://vercel.com))
- An OpenAI API key (get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys))
- Git repository (optional, but recommended)

## Deployment Steps

### Option 1: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy from your project directory**
   ```bash
   cd /Users/trhi/Documents/code/ripples
   vercel
   ```

4. **Add environment variable**
   ```bash
   vercel env add OPENAI_API_KEY
   ```
   When prompted, paste your OpenAI API key.

5. **Redeploy to apply the environment variable**
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via Vercel Dashboard

1. **Push your code to GitHub/GitLab/Bitbucket** (recommended)
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Select your Git repository
   - Click "Import"

3. **Add environment variable**
   - In the Vercel dashboard, go to your project settings
   - Navigate to "Environment Variables"
   - Add a new variable:
     - **Name**: `OPENAI_API_KEY`
     - **Value**: Your OpenAI API key
     - **Environments**: Production, Preview, Development (select all)
   - Click "Save"

4. **Redeploy**
   - Go to the "Deployments" tab
   - Click the "..." menu on the latest deployment
   - Select "Redeploy"

## File Structure

```
ripples/
├── api/
│   └── generate.js          # Serverless function for OpenAI API calls
├── index.html               # Main HTML file
├── app.js                   # Client-side JavaScript
├── styles.css               # Styles
├── vercel.json             # Vercel configuration
├── .env.example            # Example environment variables
└── DEPLOYMENT.md           # This file
```

## How It Works

- **Client-side**: The browser runs `app.js` which handles UI and game logic
- **Serverless API**: When worldtext generation is needed, the client calls `/api/generate`
- **Secure Storage**: The OpenAI API key is stored as an environment variable in Vercel, never exposed to the client
- **Fallback**: If the API fails or is not configured, the app falls back to procedural generation

## Local Development

To test locally with the serverless function:

1. **Install Vercel CLI** (if not already installed)
   ```bash
   npm install -g vercel
   ```

2. **Create a `.env` file** (copy from `.env.example`)
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your actual OpenAI API key.

3. **Run the development server**
   ```bash
   vercel dev
   ```

4. **Open in browser**
   Navigate to `http://localhost:3000`

## Troubleshooting

### API calls failing
- Check that `OPENAI_API_KEY` is set in Vercel environment variables
- Verify the API key is valid at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Check Vercel function logs in the dashboard

### "API key not configured" error
- Ensure you've added the environment variable and redeployed
- Environment variables require a redeploy to take effect

### Deployment issues
- Make sure all required files are committed to your repository
- Check the Vercel build logs for specific error messages

## Security Notes

- ✅ The API key is stored securely as an environment variable
- ✅ The key is never exposed to client-side code
- ✅ All OpenAI API calls go through your serverless function
- ⚠️ Add `.env` to `.gitignore` to prevent committing secrets (already done)

## Cost Considerations

- Vercel: Free tier includes 100GB bandwidth and unlimited serverless function invocations
- OpenAI: Charges per token used. The app uses `gpt-4o-mini` which is cost-effective
- Monitor your OpenAI usage at [platform.openai.com/usage](https://platform.openai.com/usage)
