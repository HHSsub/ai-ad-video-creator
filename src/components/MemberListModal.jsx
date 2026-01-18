import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const API_BASE = '/nexxii';

const ROLE_OPTIONS = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'commenter', label: 'Commenter' },
    { value: 'editor', label: 'Editor' },
    { value: 'manager', label: 'Manager' }
];

export default function MemberListModal({ isOpen, onClose, projectId, currentUser, isAdmin }) {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentMemberRole, setCurrentMemberRole] = useState(null);

    useEffect(() => {
        if (isOpen && projectId) {
            fetchMembers();
        }
    }, [isOpen, projectId]);

    const fetchMembers = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/projects/${projectId}/members`, {
                headers: { 'x-username': currentUser }
            });
            const data = await response.json();
            if (response.ok) {
                setMembers(data.members || []);
                const me = data.members.find(m => m.username === currentUser);
                setCurrentMemberRole(me?.role || (isAdmin ? 'admin' : null));
            } else {
                throw new Error(data.error || '멤버 목록을 불러오지 못했습니다.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (memberId, newRole) => {
        try {
            const response = await fetch(`${API_BASE}/api/projects/${projectId}/members/${memberId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-username': currentUser
                },
                body: JSON.stringify({ role: newRole })
            });
            const result = await response.json();
            if (result.success) {
                setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
            } else {
                alert(result.error || '권한 변경 실패');
            }
        } catch (err) {
            alert('오류 발생: ' + err.message);
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!confirm('정말로 이 멤버를 프로젝트에서 제외하시겠습니까?')) return;
        try {
            const response = await fetch(`${API_BASE}/api/projects/${projectId}/members/${memberId}`, {
                method: 'DELETE',
                headers: { 'x-username': currentUser }
            });
            const result = await response.json();
            if (result.success) {
                setMembers(prev => prev.filter(m => m.id !== memberId));
            } else {
                alert(result.error || '멤버 삭제 실패');
            }
        } catch (err) {
            alert('오류 발생: ' + err.message);
        }
    };

    if (!isOpen) return null;

    const isOwner = currentMemberRole === 'owner';
    const isManager = currentMemberRole === 'manager';
    const isOwnerOrAdmin = isAdmin || isOwner;
    const hasManagePermission = isOwnerOrAdmin || isManager;

    useEffect(() => {
        if (isOpen) {
            console.log(`[MemberListModal] User: ${currentUser}, Role: ${currentMemberRole}, isAdmin: ${isAdmin}, hasManagePermission: ${hasManagePermission}`);
        }
    }, [isOpen, currentMemberRole, isAdmin, hasManagePermission]);

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-2xl border border-gray-700 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        👥 프로젝트 멤버 관리
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-800 text-red-300 p-3 mb-4 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-800/50">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-800 text-gray-400 font-medium">
                            <tr>
                                <th className="px-4 py-3">사용자</th>
                                <th className="px-4 py-3">권한</th>
                                <th className="px-4 py-3">초대일</th>
                                {hasManagePermission && <th className="px-4 py-3 text-right">작업</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-gray-300">
                            {members.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={hasManagePermission ? 4 : 3} className="px-4 py-8 text-center text-gray-500">
                                        등록된 멤버가 없습니다.
                                    </td>
                                </tr>
                            )}
                            {members.map((member) => (
                                <tr key={member.id} className="hover:bg-gray-800/30 transition-colors">
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                                                {member.username[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-white">{member.username}</p>
                                                {member.role === 'owner' && <span className="text-[10px] bg-yellow-900/50 text-yellow-500 px-1 rounded border border-yellow-800">PROJECT OWNER</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        {hasManagePermission && member.role !== 'owner' ? (
                                            <select
                                                value={member.role}
                                                onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs focus:border-blue-500 outline-none disabled:opacity-50"
                                            >
                                                {ROLE_OPTIONS.map(opt => {
                                                    // Manager cannot promote to Owner
                                                    if (isManager && opt.value === 'owner') return null;
                                                    return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                                                })}
                                            </select>
                                        ) : (
                                            <span className="capitalize">{member.role}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 text-gray-500 text-xs text-nowrap">
                                        {new Date(member.addedAt).toLocaleDateString()}
                                    </td>
                                    {hasManagePermission && (
                                        <td className="px-4 py-4 text-right">
                                            {member.role !== 'owner' && (
                                                <button
                                                    onClick={() => handleRemoveMember(member.id)}
                                                    className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/20 transition-colors"
                                                    title="멤버 삭제"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-8 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}

MemberListModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    projectId: PropTypes.string.isRequired,
    currentUser: PropTypes.string.isRequired,
    isAdmin: PropTypes.bool
};
