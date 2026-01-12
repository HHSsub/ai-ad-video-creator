
import { safeCallGemini } from '../src/utils/apiHelpers.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text, texts, targetLang = 'en' } = req.body;

    if (!text && (!texts || !Array.isArray(texts))) {
        return res.status(400).json({ error: 'Text or texts array is required' });
    }

    try {
        let prompt;
        // 🔥 Batch Translation Logic
        if (texts) {
            console.log(`[translate] Batch Request: ${texts.length} items -> ${targetLang}`);
            const jsonStr = JSON.stringify(texts);
            prompt = targetLang === 'ko'
                ? `Translate the following array of English image prompts into natural Korean. Return ONLY a JSON array of strings in the same order. No markdown, no explanations.\n\n${jsonStr}`
                : `Translate the following array of Korean image prompts into English. Return ONLY a JSON array of strings in the same order. No markdown, no explanations.\n\n${jsonStr}`;
        } else {
            // Single Translation Logic
            console.log(`[translate] Request: "${text.substring(0, 50)}..." -> ${targetLang}`);
            prompt = targetLang === 'ko'
                ? `Translate the following image description prompt into natural Korean. Output ONLY the Korean text, no explanations.\n\n"${text}"`
                : `Translate the following Korean image prompt into English optimized for AI image generation. Output ONLY the English text.\n\n"${text}"`;
        }

        const result = await safeCallGemini(prompt);

        if (!result || !result.success || !result.text) {
            throw new Error('Translation failed: No text returned');
        }

        let resultText = result.text.replace(/```json/g, '').replace(/```/g, '').trim();

        if (texts) {
            // Batch Response Parsing
            try {
                const translatedArray = JSON.parse(resultText);
                if (!Array.isArray(translatedArray) || translatedArray.length !== texts.length) {
                    throw new Error('Invalid batch translation response format');
                }
                res.json({ success: true, translatedTexts: translatedArray });
            } catch (parseError) {
                console.error('[translate] JSON Parse Error:', parseError, resultText);
                throw new Error('Failed to parse batch translation response');
            }
        } else {
            // Single Response Parsing
            let translatedText = resultText.replace(/^["']|["']$/g, '').trim();
            res.json({ success: true, translatedText });
        }

    } catch (error) {
        console.error('[translate] Error:', error);
        res.status(500).json({ error: error.message });
    }
}
