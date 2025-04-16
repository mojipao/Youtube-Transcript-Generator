// Define interfaces for our data structures
interface VideoInfo {
  title: string;
  author: string;
  duration: string;
  thumbnailUrl: string;
}

interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
}

interface TTSProvider {
  name: string;
  value: string;
  requiresApiKey: boolean;
}

// DOM elements
const urlInput = document.getElementById('youtube-url') as HTMLInputElement;
const fetchButton = document.getElementById('fetch-button') as HTMLButtonElement;
const resetButton = document.getElementById('reset-button') as HTMLButtonElement;
const copyButton = document.getElementById('copy-button') as HTMLButtonElement;
const downloadButton = document.getElementById('download-button') as HTMLButtonElement;
const loadingSpinner = document.getElementById('loading-spinner') as HTMLDivElement;
const errorMessage = document.getElementById('error-message') as HTMLDivElement;
const outputSection = document.getElementById('output-section') as HTMLDivElement;
const videoInfoDiv = document.getElementById('video-info') as HTMLDivElement;
const transcriptContainer = document.getElementById('transcript-container') as HTMLDivElement;
const transcriptContent = document.getElementById('transcript-content') as HTMLDivElement;
const ttsSection = document.getElementById('tts-section') as HTMLDivElement;
const ttsButton = document.getElementById('tts-button') as HTMLButtonElement;
const ttsProviderSelect = document.getElementById('tts-provider') as HTMLSelectElement;
const ttsApiKeyInput = document.getElementById('tts-api-key') as HTMLInputElement;
const ttsAudioPlayer = document.getElementById('tts-audio-player') as HTMLAudioElement;
const ttsLoading = document.getElementById('tts-loading') as HTMLDivElement;

// TTS providers
const ttsProviders: TTSProvider[] = [
  { name: 'OpenAI', value: 'openai', requiresApiKey: true },
  { name: 'Google Cloud TTS', value: 'google', requiresApiKey: true },
  { name: 'Amazon Polly', value: 'amazon', requiresApiKey: true }
];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  hideElements(loadingSpinner, errorMessage, outputSection, ttsLoading);
  setupEventListeners();
  initializeTtsProviders();
});

// Set up event listeners
function setupEventListeners(): void {
  fetchButton?.addEventListener('click', handleFetchTranscript);
  resetButton?.addEventListener('click', resetApplication);
  copyButton?.addEventListener('click', copyTranscriptToClipboard);
  downloadButton?.addEventListener('click', downloadTranscriptAsText);
  ttsButton?.addEventListener('click', handleTextToSpeech);
  ttsProviderSelect?.addEventListener('change', handleTtsProviderChange);
  urlInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleFetchTranscript();
    }
  });
}

// Initialize TTS providers dropdown
function initializeTtsProviders(): void {
  if (!ttsProviderSelect) return;
  
  ttsProviderSelect.innerHTML = '';
  ttsProviders.forEach(provider => {
    const option = document.createElement('option');
    option.value = provider.value;
    option.textContent = provider.name;
    ttsProviderSelect.appendChild(option);
  });
  
  // Trigger change event to set initial state
  handleTtsProviderChange();
}

// Handle TTS provider change
function handleTtsProviderChange(): void {
  if (!ttsProviderSelect || !ttsApiKeyInput) return;
  
  const selectedProvider = ttsProviders.find(p => p.value === ttsProviderSelect.value);
  
  if (selectedProvider?.requiresApiKey) {
    ttsApiKeyInput.parentElement?.classList.remove('hidden');
    // Check for saved API key
    const savedKey = localStorage.getItem(`tts-api-key-${selectedProvider.value}`);
    if (savedKey) {
      ttsApiKeyInput.value = savedKey;
    } else {
      ttsApiKeyInput.value = '';
    }
  } else {
    ttsApiKeyInput.parentElement?.classList.add('hidden');
  }
}

// Save API key to localStorage
function saveApiKey(provider: string, key: string): void {
  if (key) {
    localStorage.setItem(`tts-api-key-${provider}`, key);
  }
}

// Extract YouTube video ID from various URL formats
function extractVideoId(url: string): string | null {
  // Handle various YouTube URL formats
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&#]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^\/\?#]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^\/\?#]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^\/\?#]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/user\/[^\/]+\/\?v=([^&#]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/attribution_link\?.*v%3D([^%&#]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*vi?=([^&#]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([^\/\?#]+)/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/@[a-zA-Z0-9_-]+\/video\/([^\/\?#]+)/i
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Handle fetch transcript button click
async function handleFetchTranscript(): Promise<void> {
  const url = urlInput.value.trim();
  
  if (!url) {
    showError('Please enter a YouTube URL');
    return;
  }
  
  const videoId = extractVideoId(url);
  
  if (!videoId) {
    showError('Could not extract a valid YouTube video ID from the URL');
    return;
  }

  resetOutput();
  showElement(loadingSpinner);
  hideElements(errorMessage);
  
  try {
    const response = await fetch(`/api/transcript?videoId=${videoId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch transcript');
    }
    
    displayTranscript(data.transcript, data.videoInfo);
  } catch (error) {
    let errorMsg = 'An error occurred while fetching the transcript';
    if (error instanceof Error) {
      errorMsg = error.message;
    }
    showError(errorMsg);
  } finally {
    hideElements(loadingSpinner);
  }
}

// Display the transcript with video information
function displayTranscript(transcript: TranscriptSegment[], videoInfo: VideoInfo | null): void {
  if (!transcript || transcript.length === 0) {
    showError('No transcript data available for this video');
    return;
  }

  // Display video information
  videoInfoDiv.innerHTML = `
    <h2>${videoInfo?.title || 'Unknown Title'}</h2>
    <p><strong>Channel:</strong> ${videoInfo?.author || 'Unknown Channel'}</p>
    <p><strong>Duration:</strong> ${videoInfo?.duration || 'Unknown'}</p>
  `;

  // Display transcript segments
  transcriptContent.innerHTML = '';
  
  transcript.forEach((segment) => {
    const segmentElement = document.createElement('div');
    segmentElement.className = 'transcript-segment';
    
    const formattedTime = formatTime(segment.start);
    
    segmentElement.innerHTML = `
      <div class="segment-time">${formattedTime}</div>
      <div class="segment-text">${segment.text}</div>
    `;
    
    transcriptContent.appendChild(segmentElement);
  });
  
  showElement(outputSection, ttsSection);
}

// Format seconds to MM:SS format
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Handle text-to-speech conversion
async function handleTextToSpeech(): Promise<void> {
  if (!transcriptContent.textContent) {
    showError('No transcript content to convert to speech');
    return;
  }
  
  const provider = ttsProviderSelect.value;
  const apiKey = ttsApiKeyInput.value.trim();
  
  // Save API key if provided
  if (apiKey) {
    saveApiKey(provider, apiKey);
  }
  
  // Check if API key is required but not provided
  const selectedProvider = ttsProviders.find(p => p.value === provider);
  if (selectedProvider?.requiresApiKey && !apiKey) {
    showError(`Please provide an API key for ${selectedProvider.name}`);
    return;
  }
  
  const text = getPlainTranscriptText(true);
  
  showElement(ttsLoading);
  hideElements(errorMessage);
  
  try {
    const response = await fetch('/api/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        provider,
        apiKey
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to convert text to speech');
    }
    
    const audioData = await response.blob();
    const audioUrl = URL.createObjectURL(audioData);
    
    // Update audio player with the new audio source
    if (ttsAudioPlayer) {
      ttsAudioPlayer.src = audioUrl;
      ttsAudioPlayer.classList.remove('hidden');
      ttsAudioPlayer.play();
    }
  } catch (error) {
    let errorMsg = 'An error occurred during text-to-speech conversion';
    if (error instanceof Error) {
      errorMsg = error.message;
    }
    showError(errorMsg);
  } finally {
    hideElements(ttsLoading);
  }
}

// Copy transcript to clipboard
function copyTranscriptToClipboard(): void {
  if (!transcriptContent.textContent) {
    showError('No transcript content to copy');
    return;
  }
  
  const textToCopy = getPlainTranscriptText();
  
  navigator.clipboard.writeText(textToCopy)
    .then(() => {
      const originalText = copyButton.textContent;
      copyButton.textContent = 'Copied!';
      setTimeout(() => {
        copyButton.textContent = originalText;
      }, 2000);
    })
    .catch((err) => {
      showError('Failed to copy: ' + err);
    });
}

// Download transcript as a text file
function downloadTranscriptAsText(): void {
  if (!transcriptContent.textContent) {
    showError('No transcript content to download');
    return;
  }
  
  const text = getPlainTranscriptText();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  
  a.href = url;
  a.download = `transcript-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Get plain text version of the transcript
function getPlainTranscriptText(forTts: boolean = false): string {
  const segments = transcriptContent.querySelectorAll('.transcript-segment');
  let plainText = '';
  
  segments.forEach((segment) => {
    const time = segment.querySelector('.segment-time')?.textContent || '';
    const text = segment.querySelector('.segment-text')?.textContent || '';
    
    if (forTts) {
      // For TTS, we just want the text without timestamps
      plainText += `${text} `;
    } else {
      // For copying/downloading, include timestamps
      plainText += `[${time}] ${text}\n\n`;
    }
  });
  
  return plainText.trim();
}

// Reset the application
function resetApplication(): void {
  urlInput.value = '';
  resetOutput();
  hideElements(errorMessage, outputSection, ttsSection);
  if (ttsAudioPlayer) {
    ttsAudioPlayer.pause();
    ttsAudioPlayer.src = '';
    ttsAudioPlayer.classList.add('hidden');
  }
}

// Reset output containers
function resetOutput(): void {
  videoInfoDiv.innerHTML = '';
  transcriptContent.innerHTML = '';
}

// Show error message
function showError(message: string): void {
  errorMessage.textContent = message;
  showElement(errorMessage);
  hideElements(loadingSpinner, ttsLoading);
}

// Show elements
function showElement(...elements: HTMLElement[]): void {
  elements.forEach(element => {
    if (element) element.classList.remove('hidden');
  });
}

// Hide elements
function hideElements(...elements: HTMLElement[]): void {
  elements.forEach(element => {
    if (element) element.classList.add('hidden');
  });
} 