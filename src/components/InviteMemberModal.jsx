import { useState } from 'react';
import PropTypes from 'prop-types';

const API_BASE = '/nexxii';

const ROLE_OPTIONS = [
    { value: 'viewer', label: 'Viewer (보기만)' },
    { value: 'commenter', label: 'Commenter (코멘트)' },
    { value: 'editor', label: 'Editor (편집)' },
    { value: 'manager', label: 'Manager (관리)' }
];

export default function InviteMemberModal({ isOpen, onClose, projectId, currentUser }) {
    const [inviteUsername, setInviteUsername] = useState('');
    const [inviteRole, setInviteRole] = useState('viewer');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    if (!isOpen) return null;

    const handleInvite = async () => {
        if (!inviteUsername.trim()) {
            setError('사용자명을 입력해주세요.');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const response = await fetch(`${API_BASE}/api/projects/${projectId}/members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-username': currentUser
                },
                body: JSON.stringify({
                    username: inviteUsername.trim(),
                    role: inviteRole
                })
            });

            const result = await response.json();

            if (result.success) {
                setSuccess(true);
                setInviteUsername('');
                setTimeout(() => {
                    setSuccess(false);
                    onClose();
                }, 1500);
            } else {
                throw new Error(result.error || '멤버 초대 실패');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setInviteUsername('');
        setInviteRole('viewer');
        setError(null);
        setSuccess(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">👥 멤버 초대</h3>

                {error && (
                    <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 mb-4 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="bg-green-900/30 border border-green-800 text-green-300 p-3 mb-4 rounded-lg text-sm">
                        멤버 초대 완료!
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            사용자명 (계정 ID)
                        </label>
                        <input
                            type="text"
                            value={inviteUsername}
                            onChange={(e) => setInviteUsername(e.target.value)}
                            placeholder="예: guest, test1"
                            className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                            disabled={loading}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            시스템에 등록된 사용자만 초대할 수 있습니다.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            역할 선택
                        </label>
                        <select
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                            disabled={loading}
                        >
                            {ROLE_OPTIONS.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleClose}
                        className="flex-1 px-4 py-3 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                        disabled={loading}
                    >
                        취소
                    </button>
                    <button
                        onClick={handleInvite}
                        disabled={loading || !inviteUsername.trim()}
                        className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                    >
                        {loading ? '초대 중...' : '초대하기'}
                    </button>
                </div>
            </div>
        </div>
    );
}

InviteMemberModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    projectId: PropTypes.string.isRequired,
    currentUser: PropTypes.string.isRequired
};
