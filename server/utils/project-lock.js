// server/utils/project-lock.js
// 프로젝트별 파일 쓰기 Race Condition 방지를 위한 공유 큐 유틸리티

const writeQueues = new Map();

/**
 * 특정 프로젝트 ID에 대해 순차적인 작업 실행을 보장합니다.
 * @param {string} projectId 
 * @param {Function} task 비동기 함수
 * @returns {Promise}
 */
export async function runInProjectQueue(projectId, task) {
    if (!projectId) {
        console.warn('[project-lock] No projectId provided for locking');
        return task();
    }

    if (!writeQueues.has(projectId)) {
        writeQueues.set(projectId, Promise.resolve());
    }

    const previousTask = writeQueues.get(projectId);
    const newTask = previousTask.then(async () => {
        try {
            return await task();
        } catch (err) {
            console.error(`[project-lock] Error in task for project ${projectId}:`, err);
            throw err;
        }
    });

    writeQueues.set(projectId, newTask);

    // 메모리 관리를 위해 완료 후 정리 (선택 사항)
    // newTask.finally(() => { ... });

    return newTask;
}
