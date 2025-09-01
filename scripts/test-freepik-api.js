// scripts/test-freepik-api.js
// Freepik API 연결 테스트 스크립트

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// 환경변수 로드
dotenv.config();

const FREEPIK_API_KEY = process.env.REACT_APP_FREEPIK_API_KEY;
const FREEPIK_API_BASE_URL = 'https://api.freepik.com/v1';

/**
 * Freepik API 연결 테스트
 */
async function testFreepikAPI() {
  console.log('🚀 Freepik API 연결 테스트를 시작합니다...\n');

  // API 키 확인
  if (!FREEPIK_API_KEY) {
    console.error('❌ 오류: REACT_APP_FREEPIK_API_KEY 환경변수가 설정되지 않았습니다.');
    console.log('💡 해결 방법: .env 파일에 API 키를 추가하세요:');
    console.log('   REACT_APP_FREEPIK_API_KEY=your_actual_api_key_here\n');
    return;
  }

  console.log('✅ API 키 확인: 설정됨');
  console.log(`🔑 API 키: ${FREEPIK_API_KEY.substring(0, 10)}...`);

  try {
    // 1. API 상태 확인 (간단한 검색 요청)
    console.log('\n📡 API 연결 상태 확인 중...');
    
    const testQuery = 'business professional';
    const searchUrl = `${FREEPIK_API_BASE_URL}/resources`;
    
    const params = new URLSearchParams({
      locale: 'ko-KR',
      page: 1,
      limit: 3,
      order: 'latest',
      orientation: 'horizontal',
      query: testQuery
    });

    const response = await fetch(`${searchUrl}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${FREEPIK_API_KEY}`,
        'Accept-Language': 'ko-KR,en-US',
        'Content-Type': 'application/json'
      }
    });

    console.log(`📊 응답 상태: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      
      console.log('\n✅ API 연결 성공!');
      console.log(`📋 검색 결과: ${data.data?.length || 0}개 이미지 발견`);
      
      if (data.data && data.data.length > 0) {
        console.log('\n🖼️  첫 번째 이미지 정보:');
        const firstImage = data.data[0];
        console.log(`   제목: ${firstImage.title || '제목 없음'}`);
        console.log(`   ID: ${firstImage.id}`);
        console.log(`   URL: ${firstImage.image?.url || firstImage.url || '없음'}`);
        console.log(`   태그: ${firstImage.tags?.join(', ') || '없음'}`);
      }

      // 2. 프로젝트에서 사용할 검색어로 추가 테스트
      console.log('\n🎯 프로젝트 시나리오 테스트...');
      await testProjectScenarios();

    } else {
      const errorText = await response.text();
      console.error('\n❌ API 호출 실패:');
      console.error(`   상태: ${response.status}`);
      console.error(`   응답: ${errorText}`);
      
      if (response.status === 401) {
        console.log('\n💡 해결 방법: API 키가 유효하지 않습니다. Freepik 계정에서 API 키를 확인하세요.');
      } else if (response.status === 403) {
        console.log('\n💡 해결 방법: API 사용 권한이 없거나 사용량을 초과했습니다.');
      } else if (response.status === 429) {
        console.log('\n💡 해결 방법: API 호출 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
      }
    }

  } catch (error) {
    console.error('\n❌ 네트워크 오류:', error.message);
    console.log('💡 해결 방법: 인터넷 연결을 확인하거나 방화벽 설정을 점검하세요.');
  }
}

/**
 * 프로젝트에서 실제 사용될 시나리오 테스트
 */
async function testProjectScenarios() {
  const testCases = [
    {
      scenario: '삼성 브랜드 - IT/소프트웨어 - 전문적',
      query: '삼성 technology digital professional corporate'
    },
    {
      scenario: '패션 브랜드 - 20대 타겟 - 감성적',
      query: 'fashion beauty young adult emotional lifestyle'
    },
    {
      scenario: '식품 브랜드 - 가족 타겟 - 친근한',
      query: 'food family friendly natural healthy'
    }
  ];

  for (const testCase of testCases) {
    try {
      console.log(`\n🔍 테스트: ${testCase.scenario}`);
      console.log(`   검색어: "${testCase.query}"`);

      const params = new URLSearchParams({
        locale: 'ko-KR',
        page: 1,
        limit: 2,
        order: 'latest',
        query: testCase.query
      });

      const response = await fetch(`${FREEPIK_API_BASE_URL}/resources?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${FREEPIK_API_KEY}`,
          'Accept-Language': 'ko-KR,en-US'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ 성공: ${data.data?.length || 0}개 이미지 발견`);
      } else {
        console.log(`   ❌ 실패: ${response.status}`);
      }

      // API 레이트 리미팅 방지
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.log(`   ❌ 오류: ${error.message}`);
    }
  }
}

/**
 * API 사용량 및 제한사항 안내
 */
function showUsageGuidelines() {
  console.log('\n📖 Freepik API 사용 가이드라인:');
  console.log('   • 무료 계정: 월 100회 호출 제한');
  console.log('   • 프리미엄 계정: 더 높은 호출 제한');
  console.log('   • 레이트 리미팅: 초당 1-2회 호출 권장');
  console.log('   • 이미지 다운로드: 별도 크레딧 소모');
  console.log('\n🔗 더 자세한 정보: https://freepik.com/api-documentation');
}

// 스크립트 실행
async function main() {
  await testFreepikAPI();
  showUsageGuidelines();
  
  console.log('\n🎉 테스트 완료! 위 결과를 확인하여 API 연동 상태를 점검하세요.');
}

main().catch(console.error);