// Freepik API 테스트를 위한 간단한 Node.js 스크립트
const https = require('https');

// API 키를 여기에 입력하세요
const API_KEY = 'FPSX4d50dedb168fa135f409823665e009bb';

function testFreepikImageGeneration() {
    const data = JSON.stringify({
        prompt: "a beautiful sunset over mountains with a lake",
        model: "realism",
        resolution: "2k",
        aspect_ratio: "square_1_1"
    });

    const options = {
        hostname: 'api.freepik.com',
        port: 443,
        path: '/v1/ai/mystic',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-freepik-api-key': API_KEY,
            'Content-Length': data.length
        }
    };

    console.log('Freepik 이미지 생성 API 테스트 시작...');
    console.log('요청 데이터:', data);

    const req = https.request(options, (res) => {
        console.log(`상태 코드: ${res.statusCode}`);
        console.log(`응답 헤더:`, res.headers);

        let responseData = '';
        res.on('data', (chunk) => {
            responseData += chunk;
        });

        res.on('end', () => {
            try {
                const jsonResponse = JSON.parse(responseData);
                console.log('API 응답:', JSON.stringify(jsonResponse, null, 2));
                
                if (jsonResponse.data && jsonResponse.data.task_id) {
                    console.log(`\n✅ 이미지 생성 요청 성공!`);
                    console.log(`Task ID: ${jsonResponse.data.task_id}`);
                    console.log(`상태: ${jsonResponse.data.status}`);
                    
                    // 상태 확인 함수 호출
                    setTimeout(() => {
                        checkTaskStatus(jsonResponse.data.task_id);
                    }, 5000);
                } else {
                    console.log('❌ 예상치 못한 응답 형식');
                }
            } catch (error) {
                console.error('❌ JSON 파싱 오류:', error);
                console.log('원본 응답:', responseData);
            }
        });
    });

    req.on('error', (error) => {
        console.error('❌ 요청 오류:', error);
    });

    req.write(data);
    req.end();
}

function checkTaskStatus(taskId) {
    const options = {
        hostname: 'api.freepik.com',
        port: 443,
        path: `/v1/ai/mystic/${taskId}`,
        method: 'GET',
        headers: {
            'x-freepik-api-key': API_KEY
        }
    };

    console.log(`\n상태 확인 중... Task ID: ${taskId}`);

    const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
            responseData += chunk;
        });

        res.on('end', () => {
            try {
                const jsonResponse = JSON.parse(responseData);
                console.log('상태 확인 응답:', JSON.stringify(jsonResponse, null, 2));
                
                if (jsonResponse.data) {
                    const status = jsonResponse.data.status;
                    console.log(`현재 상태: ${status}`);
                    
                    if (status === 'COMPLETED') {
                        console.log('🎉 이미지 생성 완료!');
                        if (jsonResponse.data.generated && jsonResponse.data.generated.length > 0) {
                            console.log('생성된 이미지 URL들:');
                            jsonResponse.data.generated.forEach((url, index) => {
                                console.log(`  ${index + 1}. ${url}`);
                            });
                        }
                    } else if (status === 'FAILED') {
                        console.log('❌ 이미지 생성 실패');
                    } else if (status === 'IN_PROGRESS') {
                        console.log('⏳ 아직 생성 중... 10초 후 다시 확인합니다.');
                        setTimeout(() => {
                            checkTaskStatus(taskId);
                        }, 10000);
                    }
                }
            } catch (error) {
                console.error('❌ 상태 확인 JSON 파싱 오류:', error);
                console.log('원본 응답:', responseData);
            }
        });
    });

    req.on('error', (error) => {
        console.error('❌ 상태 확인 요청 오류:', error);
    });

    req.end();
}

// 사용법 안내
if (API_KEY === 'YOUR_FREEPIK_API_KEY_HERE') {
    console.log('❌ API 키를 설정해주세요!');
    console.log('1. 이 파일을 열어서 API_KEY 변수에 실제 Freepik API 키를 입력하세요.');
    console.log('2. API 키는 https://www.freepik.com/api 에서 발급받을 수 있습니다.');
    console.log('3. 그 다음 "node simple-test.js" 명령으로 실행하세요.');
} else {
    // API 테스트 실행
    testFreepikImageGeneration();
}

