/**

narrative_shift.js
Finds a positive counter-narrative to a negative article by:
Extracting the core topic
Generating a sentiment-shifted query
Running a grounded search with Gemini
Returning a positive summary and sources
*/

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL = "gemini-2.5-flash-preview-05-20";
const apiKey = "AIzaSyBSBx48-qhSbpwXFBPmJEHcyrvoKPaTOWY";

// Retry wrapper with exponential backoff
async function fetchWithRetry(url, options, retries = 3) {
for (let i = 0; i < retries; i++) {
try {
const res = await fetch(url, options);
if (res.ok) return await res.json();

        if (res.status === 429 && i < retries - 1) {
            const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        const errBody = await res.json();
        throw new Error(
            `API ${res.status}: ${errBody.error?.message || "Unknown error"}`
        );
    } catch (err) {
        if (i === retries - 1) throw err;
        const delay = Math.pow(2, i) * 1000 + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
    }
}


}

// Main: shift a negative article into a positive narrative
export async function findOppositeNarrative(articleText) {
if (!articleText || articleText.length < 50) {
throw new Error("Article text must be at least 50 characters.");
}

const apiUrl = `${API_URL}${MODEL}:generateContent?key=${apiKey}`;

const schema = {
    type: "OBJECT",
    properties: {
        topic: { type: "STRING" },
        shiftedQuery: { type: "STRING" },
        narrativeSummary: { type: "STRING" }
    },
    required: ["topic", "shiftedQuery", "narrativeSummary"]
};

const systemPrompt =
    "You are an expert at reframing narratives. Analyze the article, extract its neutral topic, " +
    "generate a positive, solution-focused search query, ground it with Google Search, " +
    "and summarize the results in an optimistic tone.";

const userQuery =
    `Analyze this negative article, extract the core topic, then ` +
    `create a positive, solution-oriented search query. ` +
    `Use Google Search to ground the query and return a positive summary.\n\n` +
    `Negative Article Text: ${articleText}`;

const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    tools: [{ google_search: {} }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema
    }
};

const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
};

const result = await fetchWithRetry(apiUrl, options);
const candidate = result.candidates?.[0];
const rawText = candidate?.content?.parts?.[0]?.text;

if (!rawText) throw new Error("No valid response from Gemini API.");

const data = JSON.parse(rawText);

const sources = candidate.groundingMetadata?.groundingAttributions
    ?.map(a => ({ uri: a.web?.uri, title: a.web?.title }))
    .filter(s => s.uri && s.title) || [];

return {
    topic: data.topic,
    shiftedQuery: data.shiftedQuery,
    narrativeSummary: data.narrativeSummary,
    sources
};


}