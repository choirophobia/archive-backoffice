import { useState } from 'react';
import client from '../api/client';
import Modal from './Modal.jsx';
import { apiErrorMessage } from '../fields';

function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await client.put('/auth/password', { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to change password.'));
    } finally {
      setSaving(false);
    }
  };

  const safeClose = () => {
    if (!saving) onClose();
  };

  return (
    <Modal
      title="Change password"
      onClose={safeClose}
      footer={
        !success && (
          <div className="modal-footer-actions" style={{ marginLeft: 'auto' }}>
            <button type="button" className="button-secondary" onClick={safeClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="change-password-form" className="button-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </div>
        )
      }
    >
      {success ? (
        <p className="form-success">Your password has been updated.</p>
      ) : (
        <form id="change-password-form" onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}

          <div className="field">
            <label htmlFor="current-password">Current password</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </form>
      )}
    </Modal>
  );
}

export default ChangePasswordModal;
