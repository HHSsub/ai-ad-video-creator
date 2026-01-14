// scripts/reparse-gemini-response.js
// Gemini 응답 재파싱 및 이미지 생성 스크립트
// Usage: node scripts/reparse-gemini-response.js <projectId> <responseJsonFileName>
// Example: node scripts/reparse-gemini-response.js admin_1768378711038 seedream-v4_kling-v2-5-pro_manual_storyboard_storyboard_unified_1768378793498.json

import fs from 'fs';
import path from 'path';
import { parseUnifiedConceptJSON } from '../api/storyboard-init.js';
import fetch from 'node-fetch';

const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function reparseAndGenerate(projectId, responseFileName) {
    try {
        console.log(`\n🔄 프로젝트 재파싱 시작: ${projectId}`);
        console.log(`📄 응답 파일: ${responseFileName}\n`);

        // 1. 프로젝트 JSON 읽기
        const projectPath = path.join(process.cwd(), 'config', 'projects', `${projectId}.json`);
        if (!fs.existsSync(projectPath)) {
            throw new Error(`프로젝트 파일 없음: ${projectPath}`);
        }
        const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
        console.log(`✅ 프로젝트 로드: ${project.projectName || projectId}`);

        // 2. Gemini 응답 JSON 읽기
        const engineId = 'seedream-v4_kling-v2-5-pro'; // 파일명에서 추출 가능
        const mode = responseFileName.includes('_manual_') ? 'manual' : 'auto';
        const responsePath = path.join(
            process.cwd(),
            'public',
            'prompts',
            engineId,
            mode,
            'responses',
            responseFileName
        );

        if (!fs.existsSync(responsePath)) {
            throw new Error(`응답 파일 없음: ${responsePath}`);
        }

        const responseData = JSON.parse(fs.readFileSync(responsePath, 'utf8'));
        console.log(`✅ Gemini 응답 로드: ${responseFileName}`);
        console.log(`📝 응답 길이: ${responseData.response?.length || 0}자\n`);

        // 3. 재파싱
        console.log(`🔍 재파싱 시작 (mode: ${mode})...`);
        const parsed = parseUnifiedConceptJSON(responseData.response, mode);

        if (!parsed || !parsed.concepts || parsed.concepts.length === 0) {
            throw new Error('재파싱 실패: concepts가 비어있음');
        }

        console.log(`✅ 재파싱 성공: ${parsed.concepts.length}개 컨셉`);

        // 4. 씬 개수 확인
        let totalScenes = 0;
        parsed.concepts.forEach((concept, idx) => {
            const sceneKeys = Object.keys(concept).filter(k => k.startsWith('scene_'));
            console.log(`   컨셉 ${idx + 1}: ${sceneKeys.length}개 씬`);
            totalScenes += sceneKeys.length;
        });

        if (totalScenes === 0) {
            throw new Error('재파싱 후에도 씬이 0개입니다. 응답 형식을 확인하세요.');
        }

        console.log(`\n📊 총 ${totalScenes}개 씬 발견\n`);

        // 5. 프로젝트 업데이트
        project.storyboard = parsed.concepts;
        fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), 'utf8');
        console.log(`✅ 프로젝트 저장 완료: ${projectPath}\n`);

        // 6. 이미지 생성 요청
        console.log(`🎨 이미지 생성 시작...\n`);

        for (let conceptIdx = 0; conceptIdx < parsed.concepts.length; conceptIdx++) {
            const concept = parsed.concepts[conceptIdx];
            const sceneKeys = Object.keys(concept).filter(k => k.startsWith('scene_')).sort();

            console.log(`📦 컨셉 ${conceptIdx + 1}/${parsed.concepts.length} 처리 중...`);

            for (const sceneKey of sceneKeys) {
                const sceneData = concept[sceneKey];
                const sceneNumber = parseInt(sceneKey.replace('scene_', ''));

                console.log(`   🖼️  씬 ${sceneNumber} 이미지 생성 중...`);

                try {
                    const response = await fetch(`${API_BASE}/api/storyboard-render-image`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-username': 'admin'
                        },
                        body: JSON.stringify({
                            imagePrompt: sceneData.image_prompt,
                            sceneNumber,
                            conceptId: conceptIdx + 1,
                            projectId,
                            personUrl: null,
                            productImageUrl: null
                        })
                    });

                    const result = await response.json();

                    if (result.success && result.url) {
                        console.log(`   ✅ 씬 ${sceneNumber} 완료: ${result.url.substring(0, 50)}...`);

                        // 프로젝트에 이미지 URL 저장
                        const updatedProject = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
                        const conceptData = updatedProject.storyboard[conceptIdx];
                        if (conceptData[sceneKey]) {
                            conceptData[sceneKey].imageUrl = result.url;
                            conceptData[sceneKey].originalSceneNumber = `${projectId}_${conceptIdx + 1}_${sceneNumber}`;
                        }
                        fs.writeFileSync(projectPath, JSON.stringify(updatedProject, null, 2), 'utf8');
                    } else {
                        console.log(`   ⚠️  씬 ${sceneNumber} 실패: ${result.error || 'unknown error'}`);
                    }
                } catch (error) {
                    console.error(`   ❌ 씬 ${sceneNumber} 오류:`, error.message);
                }

                // 서버 부하 방지 딜레이
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`\n✅ 모든 이미지 생성 완료!`);
        console.log(`📁 프로젝트 확인: ${projectPath}\n`);

    } catch (error) {
        console.error(`\n❌ 오류 발생:`, error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// CLI 실행
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('사용법: node scripts/reparse-gemini-response.js <projectId> <responseJsonFileName>');
    console.error('예시: node scripts/reparse-gemini-response.js admin_1768378711038 seedream-v4_kling-v2-5-pro_manual_storyboard_storyboard_unified_1768378793498.json');
    process.exit(1);
}

const [projectId, responseFileName] = args;
reparseAndGenerate(projectId, responseFileName);
