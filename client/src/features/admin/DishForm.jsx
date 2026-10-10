import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { useConfirm } from '../../components/Confirm.jsx';

const BLANK = {
  category: '', name: '', accent: '', word: '', description: '', price: '', veg: false, prepMin: 15, spice: 0,
  ingredients: [], allergens: '', kcal: 0, protein: 0, chefNote: '', image: '', color: '#7A2E0C', addons: [], available: true, sort: 0
};

/** Shrink a photo in the browser before upload, so phone photos stay fast for customers. */
async function shrink(file, max = 1000) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
}

export default function DishForm({ dish, categories, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...BLANK, category: categories[0]?.id || '', ...dish }));
  const [ingredients, setIngredients] = useState((dish?.ingredients || []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const field = (name) => ({ value: form[name], onChange: (e) => set({ [name]: e.target.value }) });

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('image', await shrink(file), 'dish.jpg');
      set({ image: (await api.post('/admin/upload', body)).url });
    } catch (err) {
      setError(err.message || 'That photo could not be uploaded.');
    } finally {
      setBusy(false);
    }
  };

  // Escape closes the editor, unless the "are you sure?" dialog is the thing in front.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setAddon = (i, patch) => set({ addons: form.addons.map((a, n) => (n === i ? { ...a, ...patch } : a)) });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { id, createdAt, updatedAt, ...fields } = form;
    const body = {
      ...fields,
      ingredients: ingredients.split(',').map((s) => s.trim()).filter(Boolean),
      addons: form.addons.filter((a) => a.name.trim())
    };
    try {
      await (id ? api.put(`/admin/dishes/${id}`, body) : api.post('/admin/dishes', body));
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const [confirm, dialog] = useConfirm();
  const remove = async () => {
    const yes = await confirm({
      title: `Delete "${`${form.name} ${form.accent}`.trim()}"?`,
      body: 'The dish and its photo are removed from the menu for good. To hide it for today, switch it to sold out.',
      action: 'Delete dish'
    });
    if (!yes) return;
    setBusy(true);
    try { await api.del(`/admin/dishes/${form.id}`); onSaved(); } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="a-modal" data-lenis-prevent role="dialog" aria-modal="true" aria-label={form.id ? 'Edit dish' : 'Add dish'}>
      {dialog}
      <form className="a-modal__box" onSubmit={save}>
        <div className="a-title">
          <h1>{form.id ? 'Edit' : 'Add'} <em>dish</em></h1>
          <button type="button" className="a-btn is-icon" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>

        <div className="a-photo">
          {form.image ? <img className="a-thumb" src={form.image} alt="" /> : <div className="a-thumb" />}
          <label className="a-label">Photo
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} />
            <span className="a-hint">A top-down shot of the plate works best. It is shown in a circle.</span>
          </label>
        </div>

        <div className="a-form">
          <label className="a-label">Name<input required maxLength={60} placeholder="Dum Gosht" {...field('name')} /></label>
          <label className="a-label">Name, second part <span className="a-hint">shown in italics</span>
            <input maxLength={40} placeholder="Biryani" {...field('accent')} /></label>
          <label className="a-label">Category
            <select required {...field('category')}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="a-label">Price<input required type="number" min="0" step="1" inputMode="decimal" {...field('price')} /></label>
          <label className="a-label is-wide">Description<textarea maxLength={280} {...field('description')} /></label>
          <label className="a-label">Big background word <span className="a-hint">one short word, e.g. BIRYANI</span>
            <input maxLength={14} {...field('word')} /></label>
          <label className="a-label">Background colour <span className="a-hint">dark colours keep the text readable</span>
            <input type="color" {...field('color')} /></label>
          <label className="a-label">Ready in (minutes)<input type="number" min="0" max="240" {...field('prepMin')} /></label>
          <label className="a-label">Heat
            <select value={form.spice} onChange={(e) => set({ spice: Number(e.target.value) })}>
              <option value={0}>No heat</option><option value={1}>Mild</option><option value={2}>Medium</option><option value={3}>Fiery</option>
            </select></label>
          <label className="a-label is-wide">Ingredients <span className="a-hint">separate with commas</span>
            <input value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="Lamb, basmati, saffron" /></label>
          <label className="a-label is-wide">Allergens<input maxLength={120} placeholder="Dairy, tree nuts" {...field('allergens')} /></label>
          <label className="a-label">Calories (kcal)<input type="number" min="0" {...field('kcal')} /></label>
          <label className="a-label">Protein (g)<input type="number" min="0" {...field('protein')} /></label>
          <label className="a-label is-wide">Chef's note<textarea maxLength={220} {...field('chefNote')} /></label>

          <div className="a-label is-wide">Add-ons guests can choose
            {form.addons.map((a, i) => (
              <div key={i} className="a-rowform">
                <input className="a-input" aria-label="Add-on name" placeholder="Butter naan" maxLength={40} value={a.name} onChange={(e) => setAddon(i, { name: e.target.value })} />
                <input className="a-input" aria-label="Add-on price" type="number" min="0" style={{ maxWidth: 110 }} value={a.price} onChange={(e) => setAddon(i, { price: e.target.value })} />
                <button type="button" className="a-btn is-icon" aria-label="Remove add-on" onClick={() => set({ addons: form.addons.filter((_, n) => n !== i) })}><Icon name="trash" size={16} /></button>
              </div>
            ))}
            <button type="button" className="a-btn" style={{ alignSelf: 'flex-start' }} disabled={form.addons.length >= 8}
              onClick={() => set({ addons: [...form.addons, { name: '', price: 0 }] })}><Icon name="plus" size={16} />Add-on</button>
          </div>

          <label className="a-check"><input type="checkbox" checked={form.veg} onChange={(e) => set({ veg: e.target.checked })} />Vegetarian</label>
          <label className="a-check"><input type="checkbox" checked={form.available} onChange={(e) => set({ available: e.target.checked })} />Available today</label>
          <label className="a-label">Position in the menu <span className="a-hint">lower numbers come first</span>
            <input type="number" min="0" {...field('sort')} /></label>
        </div>

        {error && <p className="a-error" role="alert">{error}</p>}
        <div className="a-title">
          {form.id ? <button type="button" className="a-btn is-danger" onClick={remove} disabled={busy}><Icon name="trash" size={16} />Delete</button> : <span />}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="a-btn" onClick={onClose}>Cancel</button>
            <button className="a-btn is-gold" disabled={busy}>{busy ? 'Saving…' : 'Save dish'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
