import React from 'react';

export default function BgmPickerModal({ open, onClose, onPick, presets = [] }) {
  if (!open) return null;
  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <h3>BGM 선택</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {presets.map((p, idx) => (
            <li key={idx} style={styles.item}>
              <span>{p.title}</span>
              <button onClick={() => onPick(p)} style={styles.btn}>선택</button>
              <audio controls src={p.url} style={{ marginLeft: 8 }} />
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  modal: { background:'#fff', borderRadius:8, padding:16, width:420, maxHeight:'80vh', overflow:'auto' },
  item: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0' },
  btn: { marginLeft: 8 }
};
