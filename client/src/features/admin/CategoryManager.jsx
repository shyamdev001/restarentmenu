import { useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { useConfirm } from '../../components/Confirm.jsx';

export default function CategoryManager({ menu, loadMenu, setError }) {
  const { categories, dishes } = menu;
  const [name, setName] = useState('');
  const [moving, setMoving] = useState(false); // one reorder at a time, so quick taps cannot cross
  const run = (promise) => promise.then(loadMenu).catch((e) => setError(e.message));

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(api.post('/admin/categories', { name, sort: categories.length })).then(() => setName(''));
  };

  // Moving a category swaps its place with its neighbour; the whole new order is saved in one request.
  const move = async (index, delta) => {
    if (moving) return;
    const order = categories.slice();
    const [item] = order.splice(index, 1);
    order.splice(index + delta, 0, item);
    setMoving(true);
    await run(api.put('/admin/categories/order', { ids: order.map((c) => c.id) }));
    setMoving(false);
  };

  const rename = (category, value) => {
    const next = value.trim();
    if (next && next !== category.name) run(api.put(`/admin/categories/${category.id}`, { name: next, sort: category.sort }));
  };

  const [confirm, dialog] = useConfirm();
  const remove = async (category) => {
    const yes = await confirm({
      title: `Delete "${category.name}"?`,
      body: 'The category is removed from the menu. A category that still has dishes in it cannot be deleted.',
      action: 'Delete category'
    });
    if (yes) run(api.del(`/admin/categories/${category.id}`));
  };

  return (
    <>
      {dialog}
      <div className="a-title"><h1>Menu <em>categories</em></h1></div>
      <section className="a-card a-list">
        {categories.map((c, i) => (
          <div key={c.id} className="a-dish">
            <div className="a-dish__text">
              <input className="a-input" aria-label="Category name" defaultValue={c.name} maxLength={40}
                onBlur={(e) => rename(c, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
              <span>{dishes.filter((d) => d.category === c.id).length} dishes</span>
            </div>
            <button className="a-btn is-icon" aria-label="Move up" disabled={i === 0 || moving} onClick={() => move(i, -1)}><Icon name="up" size={16} /></button>
            <button className="a-btn is-icon" aria-label="Move down" disabled={i === categories.length - 1 || moving} onClick={() => move(i, 1)}><Icon name="down" size={16} /></button>
            <button className="a-btn is-icon is-danger" aria-label={`Delete ${c.name}`} onClick={() => remove(c)}><Icon name="trash" size={16} /></button>
          </div>
        ))}
        {!categories.length && <p className="a-muted">No categories yet.</p>}
      </section>

      <form className="a-card a-rowform" onSubmit={add}>
        <input className="a-input" aria-label="New category name" placeholder="New category, e.g. Drinks" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="a-btn is-gold"><Icon name="plus" size={16} />Add</button>
      </form>
      <p className="a-muted a-small">Rename a category by editing its name and tapping away. The order here is the order guests see.</p>
    </>
  );
}
