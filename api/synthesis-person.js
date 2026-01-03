import { safeCallGemini } from '../src/utils/apiHelpers.js'; // Using existing helper for uniformity (or direct fetch if needed)
import fetch from 'node-fetch';

// Freepik API Configuration (from engines.json)
const FREEPIK_API_URL = 'https://api.freepik.com/v1/ai/text-to-image/seedream-v4';

// Helper to call Freepik directly since apiHelpers might be tuned for Gemini/Vertex
async function callFreepikSeedream(prompt, aspectRatio = 'widescreen_16_9') {
    if (!process.env.FREEPIK_API_KEY) {
        throw new Error('FREEPIK_API_KEY is not set');
    }

    const response = await fetch(FREEPIK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-freepik-api-key': process.env.FREEPIK_API_KEY
        },
        body: JSON.stringify({
            prompt: prompt,
            aspect_ratio: aspectRatio,
            guidance_scale: 2.5,
            num_images: 1,
            safe_mode: true
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Freepik API Error: ${response.status} ${err}`);
    }

    const data = await response.json();
    // Assuming response structure: { data: [{ base64: "..." }] } or { data: [{ url: "..." }] }
    // Freepik usually returns base64.
    return data;
}


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const { sceneImage, personImage, personMetadata, sceneContext } = req.body;
    // personMetadata: { age, gender, nationality, name }
    // sceneContext: "Office environment", etc.

    if (!personImage || !personMetadata) {
        return res.status(400).json({ success: false, error: 'Missing person info' });
    }

    try {
        console.log(`[Synthesis] Person: ${personMetadata.name}, Context: ${sceneContext || 'General'}`);

        // 1. Construct Prompt
        // Since Seedream v4 is Text-to-Image, we describe the person in the scene.
        // We cannot easily inject the *exact* face without training/IP-Adapter, 
        // so we use the metadata to generate a *similar* person.

        const personDesc = `${personMetadata.age}-year-old ${personMetadata.nationality} ${personMetadata.gender}`;
        const sceneDesc = sceneContext || 'cinematic background';

        const prompt = `A highly realistic photo of a ${personDesc} character, ${personMetadata.name}, in a ${sceneDesc}. 
        Professional lighting, 8k resolution, detailed face, photorealistic, cinematic composition.`;

        console.log(`[Synthesis] Prompt: ${prompt}`);

        // 2. Call Freepik API
        const result = await callFreepikSeedream(prompt);

        if (!result.data || result.data.length === 0) {
            throw new Error('No image generated');
        }

        const generatedImage = result.data[0];
        // generatedImage.base64 or generatedImage.url

        // 3. Upload to S3 (if base64)
        // For now, let's assume valid return. 
        // If it's base64, we might want to upload to S3 to get a permanent URL.

        // TODO: Implement S3 upload of generated result for persistence
        // For MVP/Demo speed, if it returns URL we use it. If Base64, we send it back.
        // Let's assume Base64 for now and send back to frontend to save or display.
        // Or better, upload to S3.

        let finalUrl = generatedImage.url;

        if (generatedImage.base64) {
            const { uploadBase64ToS3 } = await import('../server/utils/s3-uploader.js');
            const filename = `synthesis_${Date.now()}_${personMetadata.name}.png`;
            const s3Result = await uploadBase64ToS3(generatedImage.base64, `nexxii-storage/projects/${filename}`);
            finalUrl = s3Result.url;
        }

        res.json({
            success: true,
            imageUrl: finalUrl,
            metadata: {
                prompt,
                engine: 'seedream-v4'
            }
        });

    } catch (error) {
        console.error('[Synthesis] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}
