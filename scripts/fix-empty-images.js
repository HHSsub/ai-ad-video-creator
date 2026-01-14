// scripts/fix-empty-images.js
// 파싱 실패 프로젝트의 images 배열 복구 스크립트
// Usage: node scripts/fix-empty-images.js admin_1768378711038

import fs from 'fs';
import path from 'path';
import { parseUnifiedConceptJSON } from '../api/storyboard-init.js';

const projectId = process.argv[2];
if (!projectId) {
    console.error('사용법: node scripts/fix-empty-images.js <projectId>');
    process.exit(1);
}

const projectPath = path.join(process.cwd(), 'config', 'projects', `${projectId}.json`);

if (!fs.existsSync(projectPath)) {
    console.error(`프로젝트 파일 없음: ${projectPath}`);
    process.exit(1);
}

console.log(`\n🔧 프로젝트 복구 시작: ${projectId}\n`);

const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));

// fullOutput에서 재파싱
const fullOutput = project.storyboard?.fullOutput;
if (!fullOutput) {
    console.error('❌ fullOutput 없음');
    process.exit(1);
}

console.log('📄 fullOutput 길이:', fullOutput.length);

const mode = project.formData?.mode || 'auto';
console.log('🎯 모드:', mode);

const parsed = parseUnifiedConceptJSON(fullOutput, mode);

if (!parsed || !parsed.concepts || parsed.concepts.length === 0) {
    console.error('❌ 재파싱 실패');
    process.exit(1);
}

console.log(`✅ 재파싱 성공: ${parsed.concepts.length}개 컨셉\n`);

// 씬 개수 확인
parsed.concepts.forEach((concept, idx) => {
    const sceneKeys = Object.keys(concept).filter(k => k.startsWith('scene_'));
    console.log(`   컨셉 ${idx + 1}: ${sceneKeys.length}개 씬`);
});

// storyboard 교체
project.storyboard.styles = parsed.concepts.map((concept, idx) => ({
    id: idx + 1,
    conceptId: idx + 1,
    conceptName: concept.concept_name,
    big_idea: concept.big_idea || '',
    style: concept.style || '',
    images: [] // 이미지는 아직 생성 안 함
}));

// 메타데이터 업데이트
const totalScenes = parsed.concepts.reduce((sum, c) => {
    return sum + Object.keys(c).filter(k => k.startsWith('scene_')).length;
}, 0);

project.storyboard.metadata.totalConcepts = parsed.concepts.length;
project.storyboard.metadata.totalImages = 0; // 아직 생성 안 함
project.updatedAt = new Date().toISOString();

// 파싱된 concepts를 별도로 저장 (이미지 생성용)
project.parsedConcepts = parsed.concepts;

// 저장
fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), 'utf8');

console.log(`\n✅ 프로젝트 업데이트 완료`);
console.log(`📊 총 ${totalScenes}개 씬 파싱됨`);
console.log(`📁 저장 위치: ${projectPath}\n`);
console.log(`🎨 이제 Admin 모드에서 프로젝트를 열면 씬이 보일 겁니다.\n`);
