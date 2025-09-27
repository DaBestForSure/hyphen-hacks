import { config } from './config.js';

const analyzeSentiment = async (title) => {
  const response = await fetch(`https://language.googleapis.com/v1/documents:analyzeSentiment?key=${config.GOOGLE_API}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document: { type: 'PLAIN_TEXT', content: title }
    })
  });
  
  const data = await response.json();
  return data.documentSentiment;
};

// Usage
const title = "Florida homeowners forced to sell after flood damage requirements";
const sentiment = await analyzeSentiment(title);

if (sentiment.score < -0.2 && sentiment.magnitude > 0.5) {
  // Show solution organizations
  console.log("Problem detected in headline, showing help organizations");
}