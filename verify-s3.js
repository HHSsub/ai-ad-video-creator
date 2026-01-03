import { s3Client, BUCKET_NAME } from './src/utils/awsConfig.js';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

async function verifyS3Migration() {
    console.log('🔍 S3 마이그레이션 검증 시작...');

    try {
        console.log(`📡 연결 시도: ${BUCKET_NAME} (리전: ap-northeast-2)`);

        // 1. 기본 연결 테스트
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            MaxKeys: 5
        });
        const response = await s3Client.send(command);

        console.log('✅ S3 연결 성공!');
        console.log(`📂 객체 수 (샘플): ${response.KeyCount}`);

        if (response.Contents && response.Contents.length > 0) {
            console.log('📝 첫 번째 객체:', response.Contents[0].Key);
        } else {
            console.log('⚠️ 버킷이 비어있습니다.');
        }

        // 2. 비용 로직 검증 (모의 데이터)
        const mockBytes = 1024 * 1024 * 1024 * 100; // 100 GB
        const estimatedCost = (mockBytes / (1024 * 1024 * 1024)) * 0.023;
        console.log(`💰 비용 계산 테스트 (100GB): $${estimatedCost.toFixed(4)} (예상: $2.3000)`);

        console.log('🎉 모든 검증 완료!');

    } catch (error) {
        console.error('❌ 검증 실패:', error);
        if (error.name === 'CredentialsProviderError') {
            console.error('💡 힌트: EC2 IAM Role이 올바르게 설정되었는지 확인하세요.');
        }
    }
}

verifyS3Migration();
