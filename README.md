# YouTube Transcript Maker

A sleek, modern web application that extracts and downloads transcripts from YouTube videos with a beautiful bioluminescent beach-themed UI.

## Features

- Extract transcripts from any YouTube video with available captions
- Beautiful UI with bioluminescent beach theme
- Support for various YouTube URL formats (including URLs with @ symbol)
- Copy transcripts to clipboard with one click
- Download transcripts as text files
- Convert transcripts to speech using various AI providers (OpenAI, Google Cloud, Amazon Polly)
- Secure API key management (stored locally, never sent to our servers)
- Responsive design for mobile and desktop

## Installation

1. Clone the repository
   ```bash
   git clone https://github.com/YOUR-USERNAME/youtube-transcript-maker.git
   cd youtube-transcript-maker
   ```

2. Install dependencies
   ```bash
   npm install
   ```
3. Build the project
   ```bash
   npm run build
   ```


4. Start the server
   ```bash
   npm start
   ```

5. Open your browser and go to http://localhost:3000

## Usage

1. Paste a YouTube video URL in the input field
2. Click "Get Transcript"
3. View, copy, or download the transcript
4. To use text-to-speech:
   - Select a TTS provider (OpenAI, Google Cloud, or Amazon Polly)
   - Enter your API key for the selected provider
   - Click "Generate Speech" to convert the transcript to audio

## Text-to-Speech API Keys

To use the text-to-speech feature, you'll need to obtain an API key from one of the supported providers:

- **OpenAI**: Sign up at [OpenAI Platform](https://platform.openai.com) and create an API key
- **Google Cloud**: Create a project in [Google Cloud Console](https://console.cloud.google.com), enable the Text-to-Speech API, and create an API key
- **Amazon Polly**: Set up an AWS account and create IAM credentials with Polly permissions

Your API keys are stored securely in your browser's localStorage and are never sent to any servers. All API calls are made directly from your browser to the respective provider.

## Development

For development with auto-reload:

```bash
npm run dev
```

## Technologies Used

- Node.js
- Express
- TypeScript
- youtube-transcript (for caption extraction)
- OpenAI API / Google Cloud Text-to-Speech / Amazon Polly
- Web Animations API
- CSS custom properties and animations

## License

This project is licensed under the MIT License.

## Created By

Mohriz Murad 
