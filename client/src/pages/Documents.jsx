import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const STATUS_BADGE = {
  pending: 'badge-gray', processing: 'badge-blue', complete: 'badge-green', failed: 'badge-red', skipped: 'badge-gray'
};

export default function Documents() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // { type: 'info'|'success'|'error', msg, docId }
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();
  const pollRef = useRef(null);

  const load = () => {
    setLoading(true);
    api.get('/api/documents').then(r => setDocs(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); return () => clearInterval(pollRef.current); }, []);

  const uploadFile = async (file) => {
    setUploading(true);
    setUploadStatus({ type: 'info', msg: `Uploading ${file.name}…` });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/api/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadStatus({ type: 'info', msg: 'Upload complete! AI is parsing your document…', docId: data.document_id });
      load();
      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const { data: doc } = await api.get(`/api/documents/${data.document_id}`);
          if (doc.parse_status === 'complete') {
            clearInterval(pollRef.current);
            setUploadStatus({ type: 'success', msg: `✓ AI extraction complete — ${file.name}`, docId: data.document_id });
            load();
          } else if (doc.parse_status === 'failed') {
            clearInterval(pollRef.current);
            setUploadStatus({ type: 'error', msg: 'AI parsing failed. You can still add characteristics manually.' });
            load();
          }
        } catch (e) { clearInterval(pollRef.current); }
      }, 3000);
    } catch (err) {
      setUploadStatus({ type: 'error', msg: err.response?.data?.error || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Documents & AI Parsing</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Upload zone */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Upload Document</div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Upload a drawing, spec sheet, control plan, or inspection report. Claude AI will extract inspection characteristics automatically.
          </p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileRef.current.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--border2)'}`,
              borderRadius: 10, padding: '36px 20px', textAlign: 'center', cursor: uploading ? 'default' : 'pointer',
              background: dragOver ? 'var(--blue-bg)' : 'var(--surface2)',
              transition: 'all 0.15s',
            }}
          >
            <input ref={fileRef} type="file" style={{ display: 'none' }}
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv"
              onChange={e => { if (e.target.files[0]) uploadFile(e.target.files[0]); e.target.value = ''; }} />
            <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
              {uploading ? 'Uploading…' : <><span style={{ color: 'var(--blue)' }}>Click to upload</span> or drag & drop</>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>PDF, images, Excel, CSV — up to 20MB</div>
          </div>

          {uploadStatus && (
            <div style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: uploadStatus.type === 'success' ? 'var(--green-bg)' : uploadStatus.type === 'error' ? 'var(--red-bg)' : 'var(--blue-bg)',
              color: uploadStatus.type === 'success' ? 'var(--green-text)' : uploadStatus.type === 'error' ? 'var(--red-text)' : 'var(--blue-text)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {uploadStatus.type === 'info' && <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
              <span style={{ flex: 1 }}>{uploadStatus.msg}</span>
              {uploadStatus.type === 'success' && uploadStatus.docId && (
                <button className="btn btn-sm btn-primary" onClick={() => navigate(`/documents/${uploadStatus.docId}/review`)}>
                  Review Extraction →
                </button>
              )}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>How It Works</div>
          {[
            ['1', 'Upload', 'Upload your drawing, spec, or existing control plan'],
            ['2', 'AI Extracts', 'Claude reads the document and extracts every inspection characteristic — nominal values, tolerances, gauge types'],
            ['3', 'Review', 'You see each extracted item with confidence level. Approve, edit, or reject each one'],
            ['4', 'Done', 'Approved items become characteristics on your control plan — ready to measure'],
          ].map(([n, title, desc]) => (
            <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--blue)', color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Documents list */}
      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Uploaded Documents</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
        ) : docs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
            <p>No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Filename</th><th>Part</th><th>Parse Status</th><th>Uploaded</th><th></th></tr>
              </thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td><strong>{d.filename || '(unnamed)'}</strong></td>
                    <td style={{ color: 'var(--text2)' }}>{d.part_number ? `${d.part_number} r${d.revision}` : '-'}</td>
                    <td><span className={`badge ${STATUS_BADGE[d.parse_status] || 'badge-gray'}`}>{d.parse_status}</span></td>
                    <td style={{ color: 'var(--text3)', fontSize: 12 }}>{new Date(d.created_at).toLocaleDateString()}</td>
                    <td>
                      {d.parse_status === 'complete' && (
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/documents/${d.id}/review`)}>
                          Review AI Extraction →
                        </button>
                      )}
                      {d.parse_status === 'processing' && <span style={{ fontSize: 12, color: 'var(--text3)' }}>Parsing…</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
