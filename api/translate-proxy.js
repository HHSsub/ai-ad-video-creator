
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

        // 🔥 NO ASSUMPTION: safeCallGemini returns { text: string, ... } as verified in apiHelpers.js

        if (!result || !result.success || !result.text) {
            console.error('[translate] Gemini response invalid:', result);
            throw new Error('Translation failed: No text returned');
        }

        let translatedText = result.text;

        // Clean up quotes if present
        translatedText = translatedText.replace(/^["']|["']$/g, '').trim();

        console.log(`[translate] Result: "${translatedText.substring(0, 50)}..."`);

        res.json({ success: true, translatedText });

    } catch (error) {
        console.error('[translate] Error:', error);
        res.status(500).json({ error: error.message });
    }
}
