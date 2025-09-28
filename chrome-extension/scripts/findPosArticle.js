/**
 * narrative_shift.js (Gemini API with Search Grounding)
 * An asynchronous function that performs sentiment-aware query construction,
 * grounded Google News search, and sentiment validation using the Gemini API.
 */

// --- API Configuration (Gemini) ---
const API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL = "gemini-2.5-flash-preview-05-20";
// NOTE: This placeholder assumes authentication is handled securely by the environment.
// const apiKey = "AIzaSyBSBx48-qhSbpwXFBPmJEHcyrvoKPaTOWY"; 
const apiKey = "AIzaSyBSBx48-qhSbpwXFBPmJEHcyrvoKPaTOWY";

// --- Helper Function: Exponential Backoff Retry ---
/**
 * Fetches data from the Gemini API with exponential backoff for resilience.
 * @param {string} url - The full API endpoint URL.
 * @param {object} options - The fetch options (method, headers, body).
 * @param {number} retries - The maximum number of retry attempts.
 */
async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log("Attempting to connect to Gemini")
            const response = await fetch(url, options);
            if (response.ok) {
                return await response.json();
            }
            if (response.status === 429 && i < retries - 1) { 
                // Rate limit encountered: calculate exponential backoff delay
                const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // Handle non-rate-limit errors
                const errorBody = await response.json();
                // Throwing an error with the specific message from the API is crucial here
                throw new Error(`API error (${response.status} ${response.statusText}): ${errorBody.error?.message || 'Unknown Error'}`);
            }
        } catch (error) {
            if (i === retries - 1) throw error;
            // Wait before retrying
            const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// --- Main Function: Find Opposite Narrative ---
/**
 * Takes a negative article text and generates a counter-narrative using a
 * sentiment-shifted query and grounded search.
 *
 * @param {string} articleText The text of the original, negatively-toned article.
 * @returns {Promise<object>} A promise that resolves to an object containing
 * the topic, shifted query, positive summary, and search sources.
 */
export async function findOppositeNarrative(articleText) {
    if (!articleText || articleText.length < 50) {
        throw new Error("Input article text is too short. Please provide at least 50 characters.");
    }

    // IMPORTANT: Ensure your apiKey variable is correctly populated here if not handled by the environment.
    const apiUrl = `${API_URL_BASE}${MODEL}:generateContent?key=${apiKey}`;

    // 1. Define the desired structured output (JSON Schema)
    const responseSchema = {
        type: "OBJECT",
        properties: {
            "topic": { 
                "type": "STRING", 
                "description": "The neutral, overarching subject of the input article (e.g., 'Global Warming' or 'Housing Crisis')." 
            },
            "shiftedQuery": { 
                "type": "STRING", 
                "description": "A new Google Search query (e.g., 'Climate change solutions technology breakthrough') using positive and action-oriented terms to find the opposite narrative." 
            },
            "narrativeSummary": { 
                "type": "STRING", 
                "description": "A grounded summary based on the 'shiftedQuery'. The summary must synthesize information from the search and explicitly adopt a positive, solution-focused tone, validating the successful sentiment shift." 
            }
        },
        required: ["topic", "shiftedQuery", "narrativeSummary"]
    };

    // 2. Define the prompt and instruction
    const userQuery = `Analyze the following negative article text, extract the core topic, and identify the negative focus (e.g., 'crisis', 'threat', 'failure'). Then, generate a new Google Search query (the 'shiftedQuery') by replacing the negative focus keywords with positive, solution-oriented, or progress-focused keywords (e.g., 'innovation', 'success', 'breakthrough'). Finally, use the Google Search tool to execute this new 'shiftedQuery' and write a summary (the 'narrativeSummary') of the positive, current news found. The entire summary MUST maintain a positive sentiment and directly address the core topic.\n\nNegative Article Text: ${articleText}`;
    
    const systemPrompt = "You are a world-class text analyzer and narrative shift expert. Your goal is to provide accurate, structured JSON output based on the user's request, ensuring the search is conducted and the final summary is positively framed and grounded in real-time information.";

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        tools: [{ "google_search": {} }], 
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };

    // --- DEBUG STEP: Log the payload for 400 error diagnosis ---
    console.log("--- DEBUG: API Request Payload Sent ---");
    console.log(JSON.stringify(payload, null, 2));
    console.log("-----------------------------------------");
    // -----------------------------------------------------------

    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    };

    // 3. Make the API Call
    const result = await fetchWithRetry(apiUrl, options);

    const candidate = result.candidates?.[0];
    if (!candidate || !candidate.content?.parts?.[0]?.text) {
        throw new Error("Failed to get a valid response from the API.");
    }

    // 4. Extract Structured Data and Sources
    const jsonString = candidate.content.parts[0].text;
    const structuredData = JSON.parse(jsonString);

    let sources = [];
    const groundingMetadata = candidate.groundingMetadata;
    if (groundingMetadata && groundingMetadata.groundingAttributions) {
        sources = groundingMetadata.groundingAttributions
            .map(attribution => ({
                uri: attribution.web?.uri,
                title: attribution.web?.title,
            }))
            .filter(source => source.uri && source.title);
    }
    
    // 5. Return the combined, structured result, including sources
    return {
        topic: structuredData.topic,
        shiftedQuery: structuredData.shiftedQuery,
        narrativeSummary: structuredData.narrativeSummary,
        sources: sources,
    };
}
