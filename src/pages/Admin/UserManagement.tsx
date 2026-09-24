import { useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { UserRole, SchoolLevel } from '../../types';
import './admin.css';

const UserManagement = () => {
  const { getUsers, addUser, updateUser, deleteUser, updateUserPassword } = useAuth();
  const users = getUsers();

  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  
  // Menu action state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Edit Password state
  const [showEditPassModal, setShowEditPassModal] = useState(false);
  const [editPassUserId, setEditPassUserId] = useState('');
  const [editPassUserName, setEditPassUserName] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editPassError, setEditPassError] = useState('');

  // Form state
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('sekolah');
  const [formSchoolName, setFormSchoolName] = useState('');
  const [formSchoolLevel, setFormSchoolLevel] = useState<SchoolLevel>('SMP');
  const [formError, setFormError] = useState('');

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.schoolName && u.schoolName.toLowerCase().includes(search.toLowerCase()));
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    const matchesLevel = filterLevel === 'all' || (u.role === 'sekolah' && u.schoolLevel === filterLevel);
    return matchesSearch && matchesRole && matchesLevel;
  });

  const resetForm = () => {
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormRole('sekolah');
    setFormSchoolName('');
    setFormSchoolLevel('SMP');
    setFormError('');
  };

  const handleOpenModal = () => {
    resetForm();
    setEditMode(false);
    setEditTargetId(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (u: any) => {
    setFormName(u.name);
    setFormUsername(u.username);
    setFormPassword('');
    setFormRole(u.role);
    setFormSchoolName(u.schoolName || '');
    setFormSchoolLevel(u.schoolLevel || 'SMP');
    setFormError('');
    setEditMode(true);
    setEditTargetId(u.id);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditMode(false);
    setEditTargetId(null);
    resetForm();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim() || !formUsername.trim()) {
      setFormError('Nama dan Username wajib diisi');
      return;
    }

    if (!editMode && (!formPassword || formPassword.trim().length < 6)) {
      setFormError('Password minimal 6 karakter');
      return;
    }

    if (formRole === 'sekolah' && !formSchoolName.trim()) {
      setFormError('Nama sekolah wajib diisi untuk role Sekolah');
      return;
    }

    if (editMode && editTargetId) {
      const updates = {
        name: formName.trim(),
        username: formUsername.trim(),
        role: formRole,
        schoolName: formRole === 'sekolah' ? formSchoolName.trim() : undefined,
        schoolLevel: formRole === 'sekolah' ? formSchoolLevel : undefined,
      };
      
      const result = await updateUser(editTargetId, updates);
      if (result.success) {
        handleCloseModal();
      } else {
        setFormError(result.error || 'Gagal mengubah user');
      }
    } else {
      const result = await addUser({
        name: formName.trim(),
        username: formUsername.trim(),
        password: formPassword,
        role: formRole,
        schoolName: formRole === 'sekolah' ? formSchoolName.trim() : undefined,
        schoolLevel: formRole === 'sekolah' ? formSchoolLevel : undefined,
      });

      if (result.success) {
        handleCloseModal();
      } else {
        setFormError(result.error || 'Gagal menambahkan user');
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Hapus akun "${name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      await deleteUser(id);
    }
  };

  const handleOpenEditPass = (id: string, name: string) => {
    setEditPassUserId(id);
    setEditPassUserName(name);
    setEditNewPassword('');
    setEditPassError('');
    setShowEditPassModal(true);
  };

  const handleEditPassSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editNewPassword.length < 6) {
      setEditPassError('Password minimal 6 karakter');
      return;
    }
    const result = await updateUserPassword(editPassUserId, editNewPassword);
    if (result.success) {
      setShowEditPassModal(false);
      alert(`Password untuk ${editPassUserName} berhasil diubah.`);
    } else {
      setEditPassError(result.error || 'Gagal mengubah password');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getRoleLabel = (role: UserRole) => {
    const labels: Record<UserRole, string> = {
      admin: 'Admin',
      kopkar: 'Kopkar',
      sekolah: 'Sekolah',
      pengurus: 'Pengurus',
    };
    return labels[role];
  };

  return (
    <div className="user-management">
      <h2>Manajemen Pengguna (Sekolah & Koperasi)</h2>

      <div className="user-toolbar">
        <div className="user-toolbar-left">
          <input
            type="text"
            className="search-input"
            placeholder="Cari nama, username, atau sekolah..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-select"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">Semua Role</option>
            <option value="admin">Admin</option>
            <option value="pengurus">Pengurus Koperasi</option>
            <option value="kopkar">Karyawan Kopkar</option>
            <option value="sekolah">Sekolah</option>
          </select>

          {filterRole === 'sekolah' && (
            <select
              className="filter-select"
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
            >
              <option value="all">Semua Jenjang</option>
              <option value="TK">Jenjang TK</option>
              <option value="SD">Jenjang SD</option>
              <option value="SMP">Jenjang SMP</option>
              <option value="SMA">Jenjang SMA</option>
            </select>
          )}
        </div>

        <button className="btn-primary" onClick={handleOpenModal}>
          + Tambah Akun Baru
        </button>
      </div>

      <div className="user-table-container">
        {filteredUsers.length > 0 ? (
          <table className="user-table">
            <thead>
              <tr>
                <th>Nama PIC</th>
                <th>Username</th>
                <th>Role</th>
                <th>Nama Sekolah</th>
                <th>Jenjang</th>
                <th>Dibuat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td><code>{u.username}</code></td>
                  <td>
                    <span className={`role-badge ${u.role}`}>{getRoleLabel(u.role)}</span>
                  </td>
                  <td>{u.schoolName || '-'}</td>
                  <td>
                    {u.schoolLevel ? (
                      <span className={`badge-level ${u.schoolLevel}`}>
                        {u.schoolLevel}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '4px 10px' }}
                        title="Opsi"
                      >
                        ⋮
                      </button>
                      {openMenuId === u.id && (
                        <div style={{
                          position: 'absolute',
                          right: '100%',
                          top: 0,
                          marginRight: '8px',
                          background: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          zIndex: 10,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          minWidth: '150px',
                          overflow: 'hidden'
                        }}>
                          <button
                            onClick={() => { handleOpenEditModal(u); setOpenMenuId(null); }}
                            style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#1e293b' }}
                          >
                            ✏️ Edit Akun
                          </button>
                          <button
                            onClick={() => { handleOpenEditPass(u.id, u.name); setOpenMenuId(null); }}
                            style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#1e293b' }}
                          >
                            🔑 Edit Password
                          </button>
                          {u.id !== 'admin-001' && (
                            <button
                              onClick={() => { handleDelete(u.id, u.name); setOpenMenuId(null); }}
                              style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', color: '#e11d48' }}
                            >
                              🗑️ Hapus User
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>Tidak ada pengguna ditemukan</p>
          </div>
        )}
      </div>

      <div className="user-count">
        Menampilkan {filteredUsers.length} dari {users.length} akun pengguna
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <h3>{editMode ? 'Edit Akun Pengguna' : 'Tambah Akun Pengguna Baru'}</h3>
            <form className="modal-form" onSubmit={handleSubmit}>
              {formError && <div className="modal-error">{formError}</div>}

              <div className="form-group">
                <label htmlFor="name">Nama Lengkap / PIC *</label>
                <input
                  id="name"
                  type="text"
                  placeholder="Contoh: Budi Santoso / Ibu Ratna"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="newUsername">Username *</label>
                <input
                  id="newUsername"
                  type="text"
                  placeholder="Contoh: smpk1 / kopkar_staf"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                />
              </div>

              {!editMode && (
                <div className="form-group">
                  <label htmlFor="newPassword">Password *</label>
                  <input
                    id="newPassword"
                    type="password"
                    placeholder="Minimal 6 karakter"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="role">Role Pengguna *</label>
                <select
                  id="role"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                >
                  <option value="sekolah">Sekolah (PIC Pemesanan)</option>
                  <option value="kopkar">Karyawan Koperasi</option>
                  <option value="pengurus">Pengurus Koperasi</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {formRole === 'sekolah' && (
                <>
                  <div className="form-group">
                    <label htmlFor="schoolName">Nama Sekolah *</label>
                    <input
                      id="schoolName"
                      type="text"
                      placeholder="Contoh: SMPK 1 PENABUR Jakarta"
                      value={formSchoolName}
                      onChange={(e) => setFormSchoolName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="schoolLevel">Jenjang Pendidikan Sekolah *</label>
                    <select
                      id="schoolLevel"
                      value={formSchoolLevel}
                      onChange={(e) => setFormSchoolLevel(e.target.value as SchoolLevel)}
                    >
                      <option value="TK">TK (Taman Kanak-kanak)</option>
                      <option value="SD">SD (Sekolah Dasar)</option>
                      <option value="SMP">SMP (Sekolah Menengah Pertama)</option>
                      <option value="SMA">SMA (Sekolah Menengah Atas)</option>
                    </select>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                      Katalog barang saat pemesanan akan otomatis disesuaikan dengan jenjang ini.
                    </div>
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Password Modal */}
      {showEditPassModal && (
        <div className="modal-overlay" onClick={() => setShowEditPassModal(false)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
            <h3>Ubah Password - {editPassUserName}</h3>
            <form className="modal-form" onSubmit={handleEditPassSubmit}>
              {editPassError && <div className="modal-error">{editPassError}</div>}
              <div className="form-group">
                <label htmlFor="editNewPassword">Password Baru</label>
                <input
                  id="editNewPassword"
                  type="password"
                  placeholder="Minimal 6 karakter"
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowEditPassModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  Simpan Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
