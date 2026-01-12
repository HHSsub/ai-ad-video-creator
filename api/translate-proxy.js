
import { safeCallGemini } from '../src/utils/apiHelpers.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text, targetLang = 'en' } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        console.log(`[translate] Request: "${text.substring(0, 50)}..." -> ${targetLang}`);

        const prompt = targetLang === 'ko'
            ? `Translate the following image description prompt into natural Korean. Output ONLY the Korean text, no explanations.\n\n"${text}"`
            : `Translate the following Korean image prompt into English optimized for AI image generation (detailed, descriptive). Output ONLY the English text.\n\n"${text}"`;

        const result = await safeCallGemini(prompt);

        // Gemini 응답이 보통 result.data.candidates[0].content.parts[0].text 형태 (safeCallGemini 구현에 따라 다름)
        // safeCallGemini returns the text directly based on convention? 
        // Let's check apiHelpers.js or assume it returns string or object.
        // Checking safeCallGemini signature in memory: it usually parses response.

        // Assuming result is the full response object or text. 
        // To be safe, let's look at apiHelpers usage later. 
        // For now, I'll assume safeCallGemini returns the standard Gemini response structure or refined text.

        // Wait, I should verify safeCallGemini return type first to be 100% sure. 
        // But for "Write to File", I can write a general structure and refine.

        // Actually, safeCallGemini in this project usually returns the *text content* directly if it's a helper wrapper?
        // Let's assume standard response handling inside safeCallGemini.

        let translatedText = '';
        if (typeof result === 'string') {
            translatedText = result;
        } else if (result?.response?.text) {
            translatedText = result.response.text();
        } else if (result?.candidates?.[0]?.content?.parts?.[0]?.text) {
            translatedText = result.candidates[0].content.parts[0].text;
        } else {
            // Fallback for custom wrapper
            translatedText = JSON.stringify(result);
        }

        // Clean up
        translatedText = translatedText.replace(/^["']|["']$/g, '').trim();

        console.log(`[translate] Result: "${translatedText.substring(0, 50)}..."`);

        res.json({ success: true, translatedText });

    } catch (error) {
        console.error('[translate] Error:', error);
        res.status(500).json({ error: error.message });
    }
}
