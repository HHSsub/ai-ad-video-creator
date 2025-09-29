import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const UserManagement = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    usageLimit: ''
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users', {
        headers: {
          'x-username': currentUser.username
        }
      });

      if (!response.ok) {
        throw new Error('사용자 목록을 불러올 수 없습니다.');
      }

      const data = await response.json();
      setUsers(data.users || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openAddModal = () => {
    setModalMode('add');
    setFormData({ username: '', password: '', name: '', usageLimit: '' });
    setSelectedUser(null);
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setModalMode('edit');
    setFormData({
      username: user.username,
      password: '',
      name: user.name,
      usageLimit: user.usageLimit !== null ? user.usageLimit : ''
    });
    setSelectedUser(user);
    setModalOpen(true);
  };

  const handleAddUser = async () => {
    if (!formData.username || !formData.password) {
      alert('아이디와 비밀번호는 필수입니다.');
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-username': currentUser.username
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          name: formData.name || formData.username,
          usageLimit: formData.usageLimit === '' ? null : parseInt(formData.usageLimit),
          currentUsername: currentUser.username
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '사용자 추가에 실패했습니다.');
      }

      alert('사용자가 추가되었습니다.');
      setModalOpen(false);
      loadUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditUser = async () => {
    try {
      const response = await fetch(`/api/users?username=${selectedUser.username}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-username': currentUser.username
        },
        body: JSON.stringify({
          password: formData.password || undefined,
          name: formData.name,
          usageLimit: formData.usageLimit === '' ? null : parseInt(formData.usageLimit),
          currentUsername: currentUser.username
        })
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data.message || '사용자 수정에 실패했습니다.');
      }
  
      alert('사용자 정보가 수정되었습니다.');
      setModalOpen(false);
      
      // 🔥 강제 새로고침 추가 (캐시 무시)
      await loadUsers();
      
      // 🔥 또는 페이지 전체 새로고침
      // window.location.reload();
      
    } catch (err) {
      alert(err.message);
    }
  };
    
  const handleDeleteUser = async (username) => {
    if (!confirm(`정말로 "${username}" 사용자를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/users?username=${username}`, {
        method: 'DELETE',
        headers: {
          'x-username': currentUser.username
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '사용자 삭제에 실패했습니다.');
      }

      alert('사용자가 삭제되었습니다.');
      loadUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const calculateRemaining = (user) => {
    if (user.role === 'admin') return '무제한';
    if (user.usageLimit === null || user.usageLimit === undefined) return '무제한';
    const remaining = user.usageLimit - (user.usageCount || 0);
    return remaining > 0 ? `${remaining}회` : '0회';
  };

  const getUsageStatus = (user) => {
    if (user.role === 'admin') return 'unlimited';
    if (user.usageLimit === null || user.usageLimit === undefined) return 'unlimited';
    const remaining = user.usageLimit - (user.usageCount || 0);
    if (remaining <= 0) return 'exceeded';
    if (remaining <= 1) return 'warning';
    return 'normal';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">사용자 관리</h2>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          + 사용자 추가
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
          {error}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <table className="w-full">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                아이디
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                이름
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                역할
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                오늘 사용
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                일일 제한
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                남은 횟수
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {users.map((user) => {
              const usageStatus = getUsageStatus(user);
              const remaining = calculateRemaining(user);
              
              return (
                <tr key={user.username} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                    {user.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {user.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      user.role === 'admin' 
                        ? 'bg-purple-900/50 text-purple-200' 
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {user.role === 'admin' ? '관리자' : '사용자'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`${
                      usageStatus === 'exceeded' ? 'text-red-400 font-bold' :
                      usageStatus === 'warning' ? 'text-yellow-400' :
                      'text-gray-300'
                    }`}>
                      {user.usageCount || 0}회
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {user.usageLimit !== null ? `${user.usageLimit}회` : '무제한'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`font-semibold ${
                      usageStatus === 'exceeded' ? 'text-red-400' :
                      usageStatus === 'warning' ? 'text-yellow-400' :
                      usageStatus === 'unlimited' ? 'text-green-400' :
                      'text-blue-400'
                    }`}>
                      {remaining}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button
                      onClick={() => openEditModal(user)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                    >
                      수정
                    </button>
                    {user.username !== 'admin' && (
                      <button
                        onClick={() => handleDeleteUser(user.username)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                      >
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">
              {modalMode === 'add' ? '사용자 추가' : '사용자 수정'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  아이디 {modalMode === 'add' && <span className="text-red-400">*</span>}
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={modalMode === 'edit'}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  placeholder="영문, 숫자 조합"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  비밀번호 {modalMode === 'add' && <span className="text-red-400">*</span>}
                  {modalMode === 'edit' && <span className="text-xs text-gray-400"> (변경 시에만 입력)</span>}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder={modalMode === 'edit' ? '변경하지 않으려면 비워두세요' : '비밀번호'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  이름
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="사용자 이름"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  일일 사용 횟수 제한
                  <span className="text-xs text-gray-400 ml-2">(비워두면 무제한)</span>
                </label>
                <input
                  type="number"
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="예: 3"
                  min="0"
                />
                <p className="mt-1 text-xs text-gray-400">
                  💡 0으로 설정하면 해당 사용자는 사용할 수 없습니다.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={modalMode === 'add' ? handleAddUser : handleEditUser}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                {modalMode === 'add' ? '추가' : '수정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

UserManagement.propTypes = {
  currentUser: PropTypes.shape({
    username: PropTypes.string.isRequired,
    role: PropTypes.string.isRequired
  }).isRequired
};

export default UserManagement;
