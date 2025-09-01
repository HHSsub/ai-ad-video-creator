const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = 3001;

// CORS 설정
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-freepik-api-key']
}));

// JSON 파싱
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 정적 파일 서빙 (HTML 테스트 페이지들)
app.use(express.static(path.join(__dirname)));

// Freepik API 프록시 엔드포인트들
const FREEPIK_BASE_URL = 'https://api.freepik.com';

// 이미지 생성 프록시
app.post('/api/freepik/mystic', async (req, res) => {
    try {
        console.log('이미지 생성 요청:', req.body);
        
        const response = await fetch(`${FREEPIK_BASE_URL}/v1/ai/mystic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-freepik-api-key': req.headers['x-freepik-api-key']
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        console.log('Freepik API 응답:', data);

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('프록시 에러:', error);
        res.status(500).json({ 
            error: '프록시 서버 오류', 
            message: error.message 
        });
    }
});

// 이미지 생성 상태 확인 프록시
app.get('/api/freepik/mystic/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        console.log('이미지 상태 확인:', taskId);
        
        const response = await fetch(`${FREEPIK_BASE_URL}/v1/ai/mystic/${taskId}`, {
            headers: {
                'x-freepik-api-key': req.headers['x-freepik-api-key']
            }
        });

        const data = await response.json();
        console.log('상태 확인 응답:', data);

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('상태 확인 에러:', error);
        res.status(500).json({ 
            error: '상태 확인 오류', 
            message: error.message 
        });
    }
});

// 동영상 생성 프록시
app.post('/api/freepik/video', async (req, res) => {
    try {
        console.log('동영상 생성 요청:', {
            ...req.body,
            first_frame_image: req.body.first_frame_image ? '[이미지 데이터]' : 'null'
        });
        
        const response = await fetch(`${FREEPIK_BASE_URL}/v1/ai/image-to-video/minimax-hailuo-02-768p`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-freepik-api-key': req.headers['x-freepik-api-key']
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        console.log('Freepik 동영상 API 응답:', data);

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('동영상 프록시 에러:', error);
        res.status(500).json({ 
            error: '동영상 프록시 서버 오류', 
            message: error.message 
        });
    }
});

// 동영상 생성 상태 확인 프록시
app.get('/api/freepik/video/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        console.log('동영상 상태 확인:', taskId);
        
        const response = await fetch(`${FREEPIK_BASE_URL}/v1/ai/image-to-video/minimax-hailuo-02-768p/${taskId}`, {
            headers: {
                'x-freepik-api-key': req.headers['x-freepik-api-key']
            }
        });

        const data = await response.json();
        console.log('동영상 상태 확인 응답:', data);

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        res.json(data);
    } catch (error) {
        console.error('동영상 상태 확인 에러:', error);
        res.status(500).json({ 
            error: '동영상 상태 확인 오류', 
            message: error.message 
        });
    }
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`프록시 서버가 http://localhost:${PORT}에서 실행 중입니다.`);
    console.log(`테스트 페이지:`);
    console.log(`- 이미지 생성: http://localhost:${PORT}/test-freepik-image-proxy.html`);
    console.log(`- 동영상 생성: http://localhost:${PORT}/test-freepik-video-proxy.html`);
});

module.exports = app;

