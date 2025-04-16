require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript');
const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Function to get video info from YouTube
async function getVideoInfo(videoId) {
  try {
    // Use the YouTube oEmbed API to get basic video information
    const response = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    
    const data = response.data;
    
    // Format the duration (YouTube API doesn't provide this through oEmbed)
    // We'll need to get the actual duration from the video page
    const videoPageResponse = await axios.get(`https://www.youtube.com/watch?v=${videoId}`);
    
    // Extract duration from the page content
    let duration = 'Unknown';
    const durationMatch = videoPageResponse.data.match(/"lengthSeconds":"(\d+)"/);
    if (durationMatch && durationMatch[1]) {
      const seconds = parseInt(durationMatch[1]);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      duration = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    return {
      title: data.title || 'Unknown',
      author: data.author_name || 'Unknown',
      duration: duration
    };
  } catch (error) {
    console.error('Error fetching video info:', error.message);
    return {
      title: 'Unknown',
      author: 'Unknown',
      duration: 'Unknown'
    };
  }
}

app.post('/api/transcript', async (req, res) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    console.log("Received videoId/URL:", videoId);
    
    // Handle URLs with @ prefix
    let cleanVideoId = videoId;
    if (typeof cleanVideoId === 'string' && cleanVideoId.startsWith('@')) {
      cleanVideoId = cleanVideoId.substring(1);
      console.log("Removed @ prefix:", cleanVideoId);
    }
    
    // If the videoId is actually a full URL, extract the ID
    let finalVideoId = cleanVideoId;
    let extractionSuccess = false;
    
    if (typeof cleanVideoId === 'string' && (cleanVideoId.includes('youtube.com') || cleanVideoId.includes('youtu.be'))) {
      const urlPatterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^\/\?#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^\/\?#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^\/\?#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^\/\?#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/user\/[^\/]+\/\?v=([^&#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/attribution_link\?.*v%3D([^%&#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*vi?=([^&#]+)/i
      ];
      
      for (const pattern of urlPatterns) {
        const match = cleanVideoId.match(pattern);
        if (match && match[1]) {
          finalVideoId = match[1];
          extractionSuccess = true;
          console.log("Extracted video ID:", finalVideoId);
          break;
        }
      }
      
      if (!extractionSuccess) {
        console.warn('Could not extract video ID from URL, attempting to use as-is:', cleanVideoId);
        
        // Try one more approach - look for "v=" in the URL
        const vParam = new URLSearchParams(cleanVideoId.split('?')[1] || '').get('v');
        if (vParam) {
          finalVideoId = vParam;
          extractionSuccess = true;
          console.log("Extracted video ID from v parameter:", finalVideoId);
        }
      }
    }
    
    try {
      // Fetch transcript
      console.log("Attempting to fetch transcript with ID:", finalVideoId);
      let transcript = await YoutubeTranscript.fetchTranscript(finalVideoId);
      
      if (!transcript || transcript.length === 0) {
        return res.status(404).json({ error: 'No transcript found for this video' });
      }
      
      // Process transcript to ensure start times are valid numbers and format in 5-second intervals
      let formattedTranscript = [];
      
      // Sort transcript by offset time to ensure proper sequencing
      transcript.sort((a, b) => parseFloat(a.offset || 0) - parseFloat(b.offset || 0));
      
      // Log FULL original data for the first few segments
      console.log("Original transcript format:", JSON.stringify(transcript.slice(0, 3)));
      
      transcript.forEach((segment, index) => {
        // Use offset instead of start for the timestamp (that's what YouTube API provides)
        const offset = parseFloat(segment.offset || 0);
        const duration = parseFloat(segment.duration || 0);
        
        // Debug log to see raw values
        if (index < 3) {
          console.log(`Processing segment ${index}:`, { 
            original: segment,
            parsedOffset: offset,
            parsedDuration: duration,
            text: segment.text
          });
        }
        
        if (isNaN(offset) || isNaN(duration)) {
          console.warn(`Invalid timestamp data at segment ${index}:`, segment);
          return; // Skip this segment
        }
        
        // Decode HTML entities in text
        const decodedText = segment.text.replace(/&amp;/g, '&')
                                        .replace(/&lt;/g, '<')
                                        .replace(/&gt;/g, '>')
                                        .replace(/&quot;/g, '"')
                                        .replace(/&#39;/g, "'")
                                        .replace(/&nbsp;/g, ' ');
        
        // Group segments into 5-second intervals
        const intervalKey = Math.floor(offset / 5) * 5;
        
        if (formattedTranscript.length === 0 || 
            formattedTranscript[formattedTranscript.length - 1].start !== intervalKey) {
          // Start a new 5-second segment
          formattedTranscript.push({
            text: decodedText,
            start: intervalKey,
            duration: 5
          });
        } else {
          // Append to the current 5-second segment
          const lastSegment = formattedTranscript[formattedTranscript.length - 1];
          lastSegment.text += ' ' + decodedText;
        }
      });
      
      // Get video info
      const videoInfo = await getVideoInfo(finalVideoId);
      
      res.json({ transcript: formattedTranscript, videoInfo });
    } catch (transcriptError) {
      console.error('Error fetching transcript with ID:', finalVideoId);
      // If the first attempt fails and we extracted an ID, try using the raw URL as fallback
      if (extractionSuccess && finalVideoId !== cleanVideoId) {
        try {
          console.log("Fallback: Attempting with original URL:", cleanVideoId);
          const transcript = await YoutubeTranscript.fetchTranscript(cleanVideoId);
          
          if (!transcript || transcript.length === 0) {
            return res.status(404).json({ error: 'No transcript found for this video' });
          }
          
          // Process transcript to ensure start times are valid numbers and format in 5-second intervals
          let formattedTranscript = [];
          
          // Sort transcript by offset time to ensure proper sequencing
          transcript.sort((a, b) => parseFloat(a.offset || 0) - parseFloat(b.offset || 0));
          
          // Log FULL original data for the first few segments
          console.log("Original transcript format:", JSON.stringify(transcript.slice(0, 3)));
          
          transcript.forEach((segment, index) => {
            // Use offset instead of start for the timestamp (that's what YouTube API provides)
            const offset = parseFloat(segment.offset || 0);
            const duration = parseFloat(segment.duration || 0);
            
            // Debug log to see raw values
            if (index < 3) {
              console.log(`Processing segment ${index}:`, { 
                original: segment,
                parsedOffset: offset,
                parsedDuration: duration,
                text: segment.text
              });
            }
            
            if (isNaN(offset) || isNaN(duration)) {
              console.warn(`Invalid timestamp data at segment ${index}:`, segment);
              return; // Skip this segment
            }
            
            // Decode HTML entities in text
            const decodedText = segment.text.replace(/&amp;/g, '&')
                                            .replace(/&lt;/g, '<')
                                            .replace(/&gt;/g, '>')
                                            .replace(/&quot;/g, '"')
                                            .replace(/&#39;/g, "'")
                                            .replace(/&nbsp;/g, ' ');
            
            // Group segments into 5-second intervals
            const intervalKey = Math.floor(offset / 5) * 5;
            
            if (formattedTranscript.length === 0 || 
                formattedTranscript[formattedTranscript.length - 1].start !== intervalKey) {
              // Start a new 5-second segment
              formattedTranscript.push({
                text: decodedText,
                start: intervalKey,
                duration: 5
              });
            } else {
              // Append to the current 5-second segment
              const lastSegment = formattedTranscript[formattedTranscript.length - 1];
              lastSegment.text += ' ' + decodedText;
            }
          });
          
          // Get video info
          const videoInfo = await getVideoInfo(cleanVideoId);
          
          res.json({ transcript, videoInfo });
        } catch (fallbackError) {
          throw transcriptError; // Use the original error for better debugging
        }
      } else {
        throw transcriptError;
      }
    }
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript: ' + error.message });
  }
});

app.get('/api/transcript', async (req, res) => {
  try {
    const { videoId } = req.query;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    console.log("Received videoId/URL:", videoId);
    
    // Handle URLs with @ prefix
    let cleanVideoId = videoId;
    if (typeof cleanVideoId === 'string' && cleanVideoId.startsWith('@')) {
      cleanVideoId = cleanVideoId.substring(1);
      console.log("Removed @ prefix:", cleanVideoId);
    }
    
    // If the videoId is actually a full URL, extract the ID
    let finalVideoId = cleanVideoId;
    let extractionSuccess = false;
    
    if (typeof cleanVideoId === 'string' && (cleanVideoId.includes('youtube.com') || cleanVideoId.includes('youtu.be'))) {
      const urlPatterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^\/\?#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^\/\?#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^\/\?#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^\/\?#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/user\/[^\/]+\/\?v=([^&#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/attribution_link\?.*v%3D([^%&#]+)/i,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*vi?=([^&#]+)/i
      ];
      
      for (const pattern of urlPatterns) {
        const match = cleanVideoId.match(pattern);
        if (match && match[1]) {
          finalVideoId = match[1];
          extractionSuccess = true;
          console.log("Extracted video ID:", finalVideoId);
          break;
        }
      }
      
      if (!extractionSuccess) {
        console.warn('Could not extract video ID from URL, attempting to use as-is:', cleanVideoId);
        
        // Try one more approach - look for "v=" in the URL
        const vParam = new URLSearchParams(cleanVideoId.split('?')[1] || '').get('v');
        if (vParam) {
          finalVideoId = vParam;
          extractionSuccess = true;
          console.log("Extracted video ID from v parameter:", finalVideoId);
        }
      }
    }
    
    try {
      // Fetch transcript
      console.log("Attempting to fetch transcript with ID:", finalVideoId);
      let transcript = await YoutubeTranscript.fetchTranscript(finalVideoId);
      
      if (!transcript || transcript.length === 0) {
        return res.status(404).json({ error: 'No transcript found for this video' });
      }
      
      // Process transcript to ensure start times are valid numbers and format in 5-second intervals
      let formattedTranscript = [];
      
      // Sort transcript by offset time to ensure proper sequencing
      transcript.sort((a, b) => parseFloat(a.offset || 0) - parseFloat(b.offset || 0));
      
      // Log FULL original data for the first few segments
      console.log("Original transcript format:", JSON.stringify(transcript.slice(0, 3)));
      
      transcript.forEach((segment, index) => {
        // Use offset instead of start for the timestamp (that's what YouTube API provides)
        const offset = parseFloat(segment.offset || 0);
        const duration = parseFloat(segment.duration || 0);
        
        // Debug log to see raw values
        if (index < 3) {
          console.log(`Processing segment ${index}:`, { 
            original: segment,
            parsedOffset: offset,
            parsedDuration: duration,
            text: segment.text
          });
        }
        
        if (isNaN(offset) || isNaN(duration)) {
          console.warn(`Invalid timestamp data at segment ${index}:`, segment);
          return; // Skip this segment
        }
        
        // Decode HTML entities in text
        const decodedText = segment.text.replace(/&amp;/g, '&')
                                        .replace(/&lt;/g, '<')
                                        .replace(/&gt;/g, '>')
                                        .replace(/&quot;/g, '"')
                                        .replace(/&#39;/g, "'")
                                        .replace(/&nbsp;/g, ' ');
        
        // Group segments into 5-second intervals
        const intervalKey = Math.floor(offset / 5) * 5;
        
        if (formattedTranscript.length === 0 || 
            formattedTranscript[formattedTranscript.length - 1].start !== intervalKey) {
          // Start a new 5-second segment
          formattedTranscript.push({
            text: decodedText,
            start: intervalKey,
            duration: 5
          });
        } else {
          // Append to the current 5-second segment
          const lastSegment = formattedTranscript[formattedTranscript.length - 1];
          lastSegment.text += ' ' + decodedText;
        }
      });
      
      // Get video info
      const videoInfo = await getVideoInfo(finalVideoId);
      
      res.json({ transcript: formattedTranscript, videoInfo });
    } catch (transcriptError) {
      console.error('Error fetching transcript with ID:', finalVideoId);
      // If the first attempt fails and we extracted an ID, try using the raw URL as fallback
      if (extractionSuccess && finalVideoId !== cleanVideoId) {
        try {
          console.log("Fallback: Attempting with original URL:", cleanVideoId);
          const transcript = await YoutubeTranscript.fetchTranscript(cleanVideoId);
          
          if (!transcript || transcript.length === 0) {
            return res.status(404).json({ error: 'No transcript found for this video' });
          }
          
          // Process transcript to ensure start times are valid numbers and format in 5-second intervals
          let formattedTranscript = [];
          
          // Sort transcript by offset time to ensure proper sequencing
          transcript.sort((a, b) => parseFloat(a.offset || 0) - parseFloat(b.offset || 0));
          
          // Log FULL original data for the first few segments
          console.log("Original transcript format:", JSON.stringify(transcript.slice(0, 3)));
          
          transcript.forEach((segment, index) => {
            // Use offset instead of start for the timestamp (that's what YouTube API provides)
            const offset = parseFloat(segment.offset || 0);
            const duration = parseFloat(segment.duration || 0);
            
            // Debug log to see raw values
            if (index < 3) {
              console.log(`Processing segment ${index}:`, { 
                original: segment,
                parsedOffset: offset,
                parsedDuration: duration,
                text: segment.text
              });
            }
            
            if (isNaN(offset) || isNaN(duration)) {
              console.warn(`Invalid timestamp data at segment ${index}:`, segment);
              return; // Skip this segment
            }
            
            // Decode HTML entities in text
            const decodedText = segment.text.replace(/&amp;/g, '&')
                                            .replace(/&lt;/g, '<')
                                            .replace(/&gt;/g, '>')
                                            .replace(/&quot;/g, '"')
                                            .replace(/&#39;/g, "'")
                                            .replace(/&nbsp;/g, ' ');
            
            // Group segments into 5-second intervals
            const intervalKey = Math.floor(offset / 5) * 5;
            
            if (formattedTranscript.length === 0 || 
                formattedTranscript[formattedTranscript.length - 1].start !== intervalKey) {
              // Start a new 5-second segment
              formattedTranscript.push({
                text: decodedText,
                start: intervalKey,
                duration: 5
              });
            } else {
              // Append to the current 5-second segment
              const lastSegment = formattedTranscript[formattedTranscript.length - 1];
              lastSegment.text += ' ' + decodedText;
            }
          });
          
          // Get video info
          const videoInfo = await getVideoInfo(cleanVideoId);
          
          res.json({ transcript: formattedTranscript, videoInfo });
        } catch (fallbackError) {
          throw transcriptError; // Use the original error for better debugging
        }
      } else {
        throw transcriptError;
      }
    }
  } catch (error) {
    console.error('Error fetching transcript:', error);
    res.status(500).json({ error: 'Failed to fetch transcript: ' + error.message });
  }
});

// Text-to-speech endpoint
app.post('/api/text-to-speech', async (req, res) => {
  try {
    const { text, provider, apiKey } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }
    
    // Check if provider requires API key
    if (['openai', 'google', 'amazon'].includes(provider) && !apiKey) {
      return res.status(400).json({ error: 'API key is required for this provider' });
    }
    
    let audioBuffer;
    
    switch (provider) {
      case 'openai':
        audioBuffer = await generateOpenAITTS(text, apiKey);
        break;
      case 'google':
        audioBuffer = await generateGoogleTTS(text, apiKey);
        break;
      case 'amazon':
        audioBuffer = await generateAmazonTTS(text, apiKey);
        break;
      default:
        return res.status(400).json({ error: 'Unsupported TTS provider' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="transcript-audio.mp3"');
    
    // Send the audio buffer
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error generating TTS:', error);
    
    // Return a more helpful error message if available
    if (error.response && error.response.data) {
      return res.status(500).json({ 
        error: `TTS Error: ${error.response.data.error || error.message}` 
      });
    }
    
    res.status(500).json({ error: 'Failed to generate text-to-speech audio' });
  }
});

// OpenAI TTS implementation
async function generateOpenAITTS(text, apiKey) {
  // OpenAI has a text length limit, so we may need to chunk the text
  const MAX_CHARS = 4000;
  const chunks = [];
  
  // Split text into chunks if needed
  if (text.length > MAX_CHARS) {
    for (let i = 0; i < text.length; i += MAX_CHARS) {
      chunks.push(text.substring(i, i + MAX_CHARS));
    }
  } else {
    chunks.push(text);
  }
  
  // Process each chunk and combine the audio
  const audioChunks = [];
  
  for (const chunk of chunks) {
    const response = await axios({
      method: 'post',
      url: 'https://api.openai.com/v1/audio/speech',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: 'tts-1',
        voice: 'alloy',
        input: chunk
      },
      responseType: 'arraybuffer'
    });
    
    audioChunks.push(Buffer.from(response.data));
  }
  
  // Combine audio chunks if needed
  return Buffer.concat(audioChunks);
}

// Google Cloud TTS implementation
async function generateGoogleTTS(text, apiKey) {
  // Google TTS has a text length limit, so we may need to chunk the text
  const MAX_CHARS = 5000;
  const chunks = [];
  
  // Split text into chunks if needed
  if (text.length > MAX_CHARS) {
    for (let i = 0; i < text.length; i += MAX_CHARS) {
      chunks.push(text.substring(i, i + MAX_CHARS));
    }
  } else {
    chunks.push(text);
  }
  
  // Process each chunk and combine the audio
  const audioChunks = [];
  
  for (const chunk of chunks) {
    const response = await axios({
      method: 'post',
      url: `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        input: { text: chunk },
        voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
        audioConfig: { audioEncoding: 'MP3' }
      }
    });
    
    // Google returns base64-encoded audio
    const audioContent = response.data.audioContent;
    audioChunks.push(Buffer.from(audioContent, 'base64'));
  }
  
  // Combine audio chunks if needed
  return Buffer.concat(audioChunks);
}

// Amazon Polly TTS implementation (simplified example)
async function generateAmazonTTS(text, apiKey) {
  // In a real implementation, you would use the AWS SDK
  // This is a simplified example to illustrate the concept
  
  // For demonstration purposes, return a placeholder message
  throw new Error('Amazon Polly TTS implementation requires AWS SDK configuration. Please use OpenAI or Google TTS for now.');
}

// Start server with improved error handling
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
  
  return server;
};

startServer(PORT); 