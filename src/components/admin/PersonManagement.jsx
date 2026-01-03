import { useState, useEffect } from 'react';

const PersonManagement = () => {
    const [persons, setPersons] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);

    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        loadPersons();
    }, []);

    const loadPersons = async () => {
        setLoading(true);
        try {
            const response = await fetch('/nexxii/api/persons');
            const data = await response.json();
            if (data.success) {
                setPersons(data.persons || []);
            }
        } catch (error) {
            console.error('Failed to load persons:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleDriveSync = async () => {
        if (!confirm('Google Drive에서 인물 이미지를 동기화하시겠습니까?\n(기존 메타데이터가 갱신됩니다)')) return;

        setSyncing(true);
        try {
            const response = await fetch('/nexxii/api/drive-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();

            if (data.success) {
                alert(`동기화 완료!\n총 ${data.count}개의 인물 정보를 갱신했습니다.`);
                loadPersons();
            } else {
                throw new Error(data.error || '동기화 실패');
            }
        } catch (error) {
            console.error('Drive Sync Error:', error);
            alert(`동기화 중 오류가 발생했습니다: ${error.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('image', selectedFile);

        try {
            const response = await fetch('/nexxii/api/persons', {
                method: 'POST',
                headers: {
                    'x-username': 'admin'
                },
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                setSelectedFile(null);
                // Reset file input
                document.getElementById('person-upload-input').value = '';
                loadPersons();
            } else {
                alert('업로드 실패: ' + data.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('업로드 중 오류가 발생했습니다.');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (filename) => {
        if (!window.confirm(`정말 삭제하시겠습니까? ${filename}`)) return;

        try {
            const response = await fetch(`/nexxii/api/persons/${filename}`, {
                method: 'DELETE',
                headers: {
                    'x-username': 'admin'
                }
            });
            const data = await response.json();
            if (data.success) {
                loadPersons();
            } else {
                alert('삭제 실패: ' + data.error);
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-800/90 rounded-lg p-6 border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white mb-1">👤 인물 아카이브 관리</h3>
                        <p className="text-gray-400 text-sm">
                            영상 합성에 사용할 인물 이미지를 관리합니다. 구글 드라이브와 동기화하여 최신화할 수 있습니다.
                        </p>
                    </div>
                    <button
                        onClick={handleDriveSync}
                        disabled={syncing}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all border ${syncing
                                ? 'bg-gray-800 text-gray-400 border-gray-700 cursor-not-allowed'
                                : 'bg-green-600/20 text-green-400 border-green-500/50 hover:bg-green-600/30 hover:border-green-400'
                            }`}
                    >
                        <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {syncing ? '동기화 중...' : 'Google Drive 동기화'}
                    </button>
                </div>

                {/* Upload Area */}
                <div className="flex items-end gap-4 mb-8 bg-gray-900/50 p-4 rounded-xl border border-gray-800">
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">새 인물 추가 (개별 업로드)</label>
                        <input
                            id="person-upload-input"
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="block w-full text-sm text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-xs file:font-semibold
                file:bg-blue-900/30 file:text-blue-400
                hover:file:bg-blue-900/50 cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || uploading}
                        className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${!selectedFile || uploading
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                            }`}
                    >
                        {uploading ? '업로드 중...' : '업로드'}
                    </button>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="text-center py-10 text-gray-500">로딩 중...</div>
                ) : persons.length === 0 ? (
                    <div className="text-center py-10 text-gray-600 border-2 border-dashed border-gray-800 rounded-xl">
                        등록된 인물이 없습니다.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {persons.map((person) => (
                            <div key={person.key} className="group relative bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-blue-500 transition-all">
                                <div className="aspect-[3/4] overflow-hidden bg-gray-950">
                                    <img
                                        src={person.url}
                                        alt={person.name}
                                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                        onError={(e) => {
                                            e.target.closest('.group').style.display = 'none';
                                        }}
                                    />
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                    <div className="text-white font-bold text-sm truncate">{person.name}</div>
                                    <div className="text-[10px] text-gray-400">{new Date(person.lastModified).toLocaleDateString()}</div>
                                </div>
                                <button
                                    onClick={() => handleDelete(person.key.split('/').pop())}
                                    className="absolute top-2 right-2 p-1.5 bg-red-600/80 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all transform hover:scale-110"
                                    title="삭제"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PersonManagement;
